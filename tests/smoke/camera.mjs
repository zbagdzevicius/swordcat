// tests/smoke/camera.mjs  (owner: camera) — the iso play camera (research/CONTROLS_SPEC.md §2, §3): fixed yaw, distance /
// pitch / clamps, zoom, the picker round trip, selection without camera swings, boss fit, the 1.0 s hand-back, tree / house
// fades and the x-ray silhouette; Meme Cam (§7.8), every §5.2 preset incl. WHIP_FALL / PULLBACK / CRANE_DOWN rails, shake.
// (`?cam=classic`, the old orbit + spring arm, is covered by controls:classic.)
// Screenshots → tests/shots/camera/*.png
import fs from 'node:fs';
import path from 'node:path';

const MEME = { pos: [0.06, 0.68, 1.9], fov: 38 };

/** Camera summary computed in the page (small JSON). */
const camState = (t) => t.G(() => {
  const g = window.__GAME__, c = g.ctx.cam, cam = g.ctx.camera, p = g.ctx.player;
  const pp = p.object3d.position, s = Math.sin(p.facing), co = Math.cos(p.facing);
  const dx = cam.position.x - pp.x, dz = cam.position.z - pp.z;
  return {
    mode: c.modeName, gameMode: g.mode, pos: cam.position.toArray(), fov: cam.fov, pivot: c.pivot.toArray(),
    dist: cam.position.distanceTo(c.pivot), distance: c.distance, yaw: c.yaw, pitch: c.pitch,
    local: [dx * co - dz * s, cam.position.y - pp.y, dx * s + dz * co],        // camera in her frame (+Z forward, +X left)
    player: pp.toArray(), facing: p.facing, ground: g.ctx.physics.heightAt(cam.position.x, cam.position.z),
    lock: c.lockTarget ? c.lockTarget.id : null, roll: c._outPose.roll, memeT: c.memeT, trauma: c.shaker.trauma,
    faded: c._fader.fadedCount, fadeUnits: c._fader.count, looping: !!c.memeLooping, shotT: c._cut.t,
  };
});

const fmt = (a) => a.map((v) => v.toFixed(2)).join(', ');
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function shotDir(t) { fs.mkdirSync(path.join(t.shotsDir, 'camera'), { recursive: true }); }

/**
 * Wait (game state, not wall clock: other agents load this machine) until `pred(cam)` holds in the page.
 * `pred` is a function source evaluated in the page with `c` = ctx.cam. Returns true / false (timeout).
 */
async function until(t, pred, timeout = 15000) {
  try {
    await t.page.waitForFunction((src) => { const c = window.__GAME__?.ctx?.cam; return !!c && new Function('c', `return (${src});`)(c); }, pred, { timeout, polling: 50 });
    return true;
  } catch { return false; }
}

export default [
  {
    name: 'camera:iso-follow', order: 40, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      shotDir(t);
      await t.frames(10);
      const a = await t.G(() => ({ iso: window.__GAME__.cam.iso(), mode: window.__GAME__.ctx.cam.modeName, near: window.__GAME__.ctx.camera.near, far: window.__GAME__.ctx.camera.far }));
      t.assert(a.mode === 'follow', `mode ${a.mode}`);
      t.assert(Math.abs(a.iso.yaw - Math.PI) < 1e-6, `fixed yaw π (${a.iso.yaw})`);
      t.assert(a.iso.dist >= 9 && a.iso.dist <= 18, `distance ${a.iso.dist.toFixed(2)} in [9, 18]`);
      t.assert(a.iso.pitch > 0.78 && a.iso.pitch < 1.03, `pitch ${(a.iso.pitch * 57.3).toFixed(1)}° in [46, 58]`);
      t.assert(Math.abs(a.near - 0.3) < 1e-6 && Math.abs(a.far - 90) < 1e-6, `near / far 0.3 / 90 (${a.near} / ${a.far})`);
      // walking (W = screen-up = +Z at yaw π): the focus follows her, the yaw never changes, the lens stays above ground
      const p0 = await t.G(() => window.__GAME__.ctx.player.pos.toArray());
      await t.hold('KeyW', 900);
      await t.frames(20);
      const b = await t.G(() => { const g = window.__GAME__, c = g.ctx.cam, cam = g.ctx.camera, p = g.ctx.player.pos; return { iso: g.cam.iso(), p: p.toArray(), cy: cam.position.y - g.ctx.physics.heightAt(cam.position.x, cam.position.z), fz: c.focus.z - p.z }; });
      t.assert(b.p[2] - p0[2] > 2, `W walks screen-up (+Z): Δz ${(b.p[2] - p0[2]).toFixed(2)}`);
      t.assert(Math.abs(b.iso.yaw - Math.PI) < 1e-6, 'the yaw never turns');
      t.assert(b.cy > 5, `lens well above the ground (${b.cy.toFixed(1)} m)`);
      t.assert(Math.abs(b.fz) < 3, `focus near her (Δz ${b.fz.toFixed(2)})`);
      await t.shot('camera/iso-follow');
      // screen ↔ ground round trip (the picker): a ground point 4 m ahead projects and un-projects to itself
      const rt = await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos, x = p.x + 1, z = p.z + 4; const s = g.screen(x, z); const w = g.ctx.cam.screenToGround(s.x, s.y); return [x, z, w.x, w.z]; });
      t.assert(Math.hypot(rt[0] - rt[2], rt[1] - rt[3]) < 0.15, `screenToGround round trip (${fmt(rt)})`);
      // teleport: the rig cuts (no sweep across the map)
      await t.G(() => { const g = window.__GAME__; g.teleport(-20, g.ctx.physics.heightAt(-20, 7), 7); });
      await t.frames(3);
      const c = await t.G(() => { const g = window.__GAME__, f = g.ctx.cam.focus, p = g.ctx.player.pos; return Math.hypot(f.x - p.x, f.z - p.z); });
      t.assert(c < 3, `teleport snaps the focus (${c.toFixed(2)} m)`);
      // zoom clamps 0.7–1.4 and the cat-size clamp
      const z = await t.G(async () => { const g = window.__GAME__; g.cam.zoom(9); await g.waitFrames(60); const hi = g.cam.iso(); g.cam.zoom(0.1); await g.waitFrames(60); const lo = g.cam.iso(); g.cam.zoom(1); await g.waitFrames(30); return [hi.dist, hi.catPx, lo.dist]; });
      t.assert(z[0] <= 18.01 && z[1] >= 29.5 && z[2] >= 8.99, `zoom: far ${z[0].toFixed(1)} m (${z[1].toFixed(0)} px), near ${z[2].toFixed(1)} m`);
      t.log(`iso: d ${a.iso.dist.toFixed(2)} pitch ${(a.iso.pitch * 57.3).toFixed(1)}° fov ${a.iso.fov} cat ${a.iso.catPx.toFixed(0)} px; zoom ${z.map((v) => v.toFixed(1))}`);
    },
  },
  {
    name: 'camera:select', order: 43, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      shotDir(t);
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; g.god(true); g.spawn('rat_pike', p.x + 2, p.z + 4); g.spawn('rat_pike', p.x - 3, p.z + 3); });
      await t.frames(20);
      const yaw0 = await t.G(() => window.__GAME__.ctx.cam.yaw);
      await t.tap('Tab');
      await t.frames(5);
      const a = await camState(t);
      t.assert(a.lock != null, 'Tab selects a hostile');
      t.assert(Math.abs(a.yaw - yaw0) < 1e-6, 'a selection never turns the camera (§7.4)');
      await t.shot('camera/select');
      await t.tap('Tab');
      await t.frames(5);
      const b = await camState(t);
      t.assert(b.lock != null && b.lock !== a.lock, 'Tab again cycles to the other one');
      // kill the selection: it hands over to the other engaged rat within 6 m, or clears
      await t.G(() => { const g = window.__GAME__, e = g.ctx.cam.lockTarget; e.alerted = true; g.ctx.combat.applyHit(g.ctx.player, e, { ...g.ctx.config.ATTACKS.slash3, dmg: 999 }); });
      await t.frames(30);
      const c = await camState(t);
      t.assert(c.lock !== b.lock, 'a dead selection does not stay selected');
      // walking 17 m away breaks it
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; g.teleport(p.x, g.ctx.physics.heightAt(p.x, p.z - 18), p.z - 18); });
      await t.frames(20);
      const d = await camState(t);
      t.assert(d.lock == null, 'the selection breaks beyond 16 m');
      await t.G(() => { const g = window.__GAME__; for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); g.god(false); });
    },
  },
  {
    name: 'camera:boss-fit', order: 44.2, level: 'forest', spawn: 'boss', timeout: 200000,
    async run(t) {
      shotDir(t);
      // §2.4 boss framing (B1 forest mill, B2 gate causeway): both on screen, d in [14, 22], focus between them
      for (const L of [{ level: 'forest', id: 'B1' }, { level: 'gate', id: 'B2' }]) {
        if (L.level !== 'forest') await t.loadLevel(L.level, 'boss');
        await t.clearEvents();
        await t.G((lv) => { const g = window.__GAME__; g.god(true); if (lv === 'gate') g.ctx.state.setFlag('gate.line', true); }, L.level);   // B2's arena waits for The Line
        await t.G(() => window.__GAME__.startBoss());
        let started = await t.waitForEvent('boss:start', 15000);
        if (!started) { await t.frames(30); await t.G(() => window.__GAME__.startBoss()); started = await t.waitForEvent('boss:start', 15000); }
        t.assert(started, `${L.id}: startBoss() did not emit boss:start`);
        if (!started) continue;
        await t.G(async () => {
          const g = window.__GAME__, ctx = g.ctx, b = ctx.enemies.boss, p = ctx.player;
          if (!b) return;
          b.ai = false;
          const x = p.pos.x + 6, z = p.pos.z + 3;
          b.pos.set(x, ctx.physics.heightAt(x, z), z); b.object3d.position.copy(b.pos); b.vel?.set?.(0, 0, 0);
          await g.waitFrames(90);
        });
        const r = await t.G(() => {
          const g = window.__GAME__, b = g.ctx.enemies.boss, p = g.ctx.player, cam = g.ctx.camera;
          const pr = (o, h) => { const v = o.object3d.position.clone(); v.y += h; v.project(cam); return [v.x, v.y]; };
          return { her: pr(p, 0.5), boss: pr(b, (b.height ?? 2) * 0.6), iso: g.cam.iso(), mode: g.ctx.cam.modeName };
        });
        t.assert(Math.abs(r.her[0]) < 0.62 && Math.abs(r.her[1]) < 0.7, `${L.id}: she sits inside the inner frame (${fmt(r.her)})`);
        t.assert(Math.abs(r.boss[0]) < 0.95 && Math.abs(r.boss[1]) < 0.95, `${L.id}: the boss is on screen (${fmt(r.boss)})`);
        t.assert(r.iso.dist >= 13.9 && r.iso.dist <= 22.1, `${L.id}: boss distance ${r.iso.dist.toFixed(1)} in [14, 22]`);
        t.assert(r.mode === 'boss' || r.mode === 'lock', `${L.id}: cam mode ${r.mode}`);
        await t.shot(`camera/boss-${L.id}`, { freeze: true });
        // BOSS_INTRO reveal (height-scaled) on the boss still works from the iso rig
        await t.setMode('cutscene');
        await t.G(() => { const g = window.__GAME__; g.ctx.cam.shot({ preset: 'BOSS_INTRO', anchor: g.ctx.enemies.boss, mode: 'cut' }); });
        await t.frames(4);
        const intro = await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss, v = b.object3d.position.clone(); v.y += b.height * 0.8; v.project(g.ctx.camera); return { head: [v.x, v.y], mode: g.ctx.cam.modeName }; });
        t.assert(intro.mode === 'preset' && Math.abs(intro.head[0]) < 0.9 && Math.abs(intro.head[1]) < 0.95, `${L.id}: BOSS_INTRO head ${fmt(intro.head)}`);
        await t.shot(`camera/boss-intro-${L.id}`, { freeze: true });
        await t.setMode('play');
        await t.G(() => { const g = window.__GAME__; g.ctx.cam.mode('follow', { blend: false }); for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); g.god(false); });
        await t.frames(4);
        t.log(`${L.id}: her ${fmt(r.her)}, boss ${fmt(r.boss)}, d ${r.iso.dist.toFixed(1)}`);
      }
    },
  },
  {
    name: 'camera:handback', order: 45.2, level: 'forest', spawn: 'start', timeout: 120000,
    async run(t) {
      shotDir(t);
      // §2.6: a cutscene shot → back to play: a 1.0 s crane arc to the iso pose, never through the ground
      await t.setMode('cutscene');
      await t.G(() => window.__GAME__.ctx.cam.preset('HERO_LOW', 'swordcat', { mode: 'cut' }));
      await t.frames(5);
      await t.setMode('play');
      const r = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx.cam, cam = g.ctx.camera, ph = g.ctx.physics;
        c.mode('follow');
        let minClear = Infinity, frames = 0;
        const t0 = performance.now();
        while (c._blend.active && frames < 600) { await g.waitFrames(1); frames++; minClear = Math.min(minClear, cam.position.y - ph.heightAt(cam.position.x, cam.position.z)); }
        return { dur: c._blend.dur, minClear, frames, ms: performance.now() - t0, iso: g.cam.iso(), mode: c.modeName };
      });
      t.assert(Math.abs(r.dur - 1.0) < 1e-6, `hand-back blend ${r.dur} s (1.0)`);
      t.assert(r.minClear > 0.1, `the hand-back never dips under the terrain (min ${r.minClear.toFixed(2)} m)`);
      t.assert(r.mode === 'follow' && r.iso.dist > 9, `back in the iso rig (${r.mode}, d ${r.iso.dist.toFixed(1)})`);
      await t.shot('camera/handback');
      t.log(`hand-back: ${r.frames} frames, lowest ${r.minClear.toFixed(2)} m above ground`);
    },
  },
  {
    name: 'camera:occlusion', order: 46, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      shotDir(t);
      // a fadeable tree right on the lens side of her (south at yaw π): it fades; her x-ray shows behind solid things
      const info = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, fader = ctx.cam._fader;
        const p = new THREE.Vector3();
        let best = null, bd = Infinity;
        const pp = ctx.player.pos;
        for (const u of fader.units) {
          if (u.solid) continue;
          const part = u.parts[0];
          p.setFromMatrixPosition(part.world);
          const d = Math.hypot(p.x - pp.x, p.z - pp.z) + (/tree/i.test(u.root.name ?? '') ? 0 : 1000);
          if (d < bd) { bd = d; best = { pos: p.clone(), name: u.root.name, top: u.center.y + u.radius }; }
        }
        if (!best) return { ok: false, n: fader.count };
        // her 4 m north of the tree: the line lens → her passes the crown
        const x = best.pos.x, z = best.pos.z + 4;
        ctx.player.teleport({ pos: new THREE.Vector3(x, ctx.physics.topAt(x, z), z), facing: 0 });
        await g.waitFrames(60);
        return { ok: true, n: fader.count, faded: fader.fadedCount, tree: best.name };
      });
      t.assert(info.ok && info.n > 10, `fadeable props registered (${info.n})`);
      if (info.ok) t.assert(info.faded > 0, `a tree between the lens and her fades (${info.faded} faded, ${info.tree})`);
      await t.shot('camera/occlusion-tree', { freeze: true });
      // x-ray: a solid box right on the lens line hides her: the silhouette proxy shows
      const x = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, cam = ctx.camera, p = ctx.player;
        const chest = p.object3d.position.clone(); chest.y += 0.5;
        const at = chest.clone().lerp(cam.position, 0.3);
        const col = { x: at.x, z: at.z, hx: 1.2, hz: 1.2, y0: at.y - 3, y1: at.y + 1.2, cam: true };
        ctx.physics.addCollider(col);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.2, 2.4), new THREE.MeshStandardMaterial({ color: '#6E6A62' }));
        mesh.position.set(at.x, at.y - 0.9, at.z); ctx.scene.add(mesh);
        await g.waitFrames(30);
        window.__camOcc = { mesh, col };
        return { on: !!ctx.cam._xrayOn };
      });
      await t.shot('camera/occlusion-xray', { freeze: true });
      await t.G(async () => { const o = window.__camOcc, ctx = window.__GAME__.ctx; ctx.physics.removeCollider(o.col); o.mesh.removeFromParent(); o.mesh.geometry.dispose(); o.mesh.material.dispose(); delete window.__camOcc; await window.__GAME__.waitFrames(20); });
      t.assert(x.on, 'her x-ray silhouette shows while a solid prop hides her');
      const off = await t.G(() => !window.__GAME__.ctx.cam._xrayOn);
      t.assert(off, 'the x-ray goes away once she is visible again');
    },
  },
  {
    name: 'camera:town-occlusion', order: 46.8, level: 'town', spawn: 'hub', timeout: 180000,
    async run(t) {
      shotDir(t);
      const info = await t.G(() => { const c = window.__GAME__.ctx.cam; return { solids: c.solidOccluders, units: c._fader.count }; });
      t.assert(info.solids >= 6, `town: only ${info.solids} solid occluders registered (houses, castle, tower)`);
      await t.shot('camera/town-follow', { freeze: true });
      // her just north of a house (the lens is south at yaw π): the house hides her → it fades
      const r = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, f = ctx.cam._fader, p0 = ctx.player.pos;
        let best = null;
        for (const u of f.units) {
          if (!u.solid || u.radius < 3 || u.radius > 9) continue;
          const d = Math.hypot(u.center.x - p0.x, u.center.z - p0.z);
          if (!best || d < best.d) best = { u, d };
        }
        if (!best) return null;
        const u = best.u, box = new THREE.Box3();
        for (const pt of u.parts) box.union(pt.box.clone().applyMatrix4(pt.world));
        for (const dz of [0.8, 1.2, 1.8, 2.5]) {
          const x = u.center.x, z = box.max.z + dz;
          if (ctx.physics.blockedAt?.(x, z, 0.35, ctx.physics.heightAt(x, z) + 0.2, ctx.physics.heightAt(x, z) + 1.0)) continue;
          ctx.player.teleport({ pos: new THREE.Vector3(x, ctx.physics.topAt(x, z), z), facing: 0 });
          break;
        }
        await g.waitFrames(60);
        return { faded: f.fadedSolidCount, top: box.max.y, xray: !!ctx.cam._xrayOn };
      });
      t.assert(r, 'no house-sized solid occluder near the hub spawn');
      if (!r) return;
      t.assert(r.faded >= 1 || r.xray, `a house hiding her fades (faded solids ${r.faded}, x-ray ${r.xray})`);
      await t.shot('camera/town-house-fade', { freeze: true });
      t.log(`town: ${info.solids} solid occluders; house behind-her test: faded ${r.faded}, x-ray ${r.xray}`);
    },
  },
  {
    name: 'camera:meme', order: 42, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      shotDir(t);
      await t.frames(5);
      await t.G(() => window.__GAME__.idle(16));
      const on = await t.waitForEvent('camera:meme', 3000);
      t.assert(on, 'idle(16) did not emit camera:meme');
      if (!on) return;
      t.assert((await t.lastEvent('camera:meme'))?.on === true, 'camera:meme {on:true}');
      await t.wait(400);
      await t.shot('camera/meme-blend');
      t.assert(await until(t, "c.modeName === 'meme' && !c._blend.active"), 'Meme Cam blend-in (2.0 s) never finished');
      await t.frames(2);
      const a = await camState(t);
      t.assert(a.mode === 'meme', `cam mode ${a.mode}`);
      t.assert(Math.abs(a.fov - MEME.fov) < 0.3, `meme fov ${a.fov.toFixed(1)}, expected ${MEME.fov}`);
      const err = dist3(a.local, MEME.pos);
      t.assert(err < 0.02, `MEME_LOOP placement off by ${err.toFixed(3)} m (local ${fmt(a.local)})`);
      await t.shot('camera/meme');
      await t.blankCheck('camera/meme');
      await t.wait(500);
      const b = await camState(t);
      const sway = dist3(a.pos, b.pos);
      t.assert(sway > 0 && sway < 0.018, `meme sway ${sway.toFixed(4)} m (expected tiny, non-zero; ≤ 2·0.005·√3)`);
      t.assert(b.memeT >= 0 && b.memeT < 3.8, `memeT ${b.memeT}`);
      await t.clearEvents();
      await t.hold('KeyW', 120);                            // any input exits
      const off = await t.waitForEvent('camera:meme', 2000);
      t.assert(off && (await t.lastEvent('camera:meme'))?.on === false, 'input did not exit Meme Cam (camera:meme {on:false})');
      await until(t, "c.modeName !== 'meme' && !c._blend.active", 5000);
      await t.frames(5);
      const c = await camState(t);
      t.assert(c.mode === 'follow', `after exit cam mode ${c.mode}`);
      const isoD = await t.G(() => window.__GAME__.cam.iso().dist);
      t.assert(isoD > 9 && isoD < 18.5, `after exit: back in the iso rig (${isoD.toFixed(2)} m)`);
      t.log(`meme local ${fmt(a.local)} fov ${a.fov.toFixed(1)}; sway ${(sway * 1000).toFixed(1)} mm/0.5 s`);

      // a wall right in front of her face: the framing swings around her to a clear 3/4 view (never inside the wall)
      await t.frames(60);
      const wall = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, p = ctx.player, f = p.facing, s = Math.sin(f), co = Math.cos(f);
        const cx = p.pos.x + s * 0.85 + co * 0.15, cz = p.pos.z + co * 0.85 - s * 0.15, gy = ctx.physics.heightAt(cx, cz);
        const col = { x: cx, z: cz, r: 0.35, y0: gy - 1, y1: gy + 3 };
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3, 14), new THREE.MeshStandardMaterial({ color: '#7A7468' }));
        mesh.position.set(cx, gy + 1.5, cz); mesh.name = 'smoke:pillar'; ctx.scene.add(mesh);
        ctx.physics.addCollider(col);
        window.__camSmoke = { col, mesh };
        return { off: ctx.cam.memeYawOffset(p) };
      });
      t.assert(wall.off !== 0, 'a pillar in front of her face did not rotate the Meme Cam framing');
      await t.clearEvents();
      await t.G(() => window.__GAME__.idle(16));
      t.assert(await t.waitForEvent('camera:meme', 10000), 'second Meme Cam did not start');
      t.assert(await until(t, "c.modeName === 'meme' && !c._blend.active"), 'second Meme Cam blend-in never finished');
      const w = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, p = ctx.player, cam = ctx.camera;
        const eyes = new THREE.Vector3(p.pos.x, p.pos.y + 0.82, p.pos.z);
        return { off: ctx.cam._meme.yawOffset, clear: ctx.physics.lineOfSight(eyes, cam.position, { terrain: true, mesh: true, statics: true }) };
      });
      t.assert(w.off !== 0 && w.clear, `meme behind the pillar: yaw offset ${w.off}, clear view ${w.clear}`);
      await t.shot('camera/meme-pillar');
      await t.hold('KeyW', 120);
      await until(t, "c.modeName !== 'meme'", 3000);
      await t.G(() => {
        const ctx = window.__GAME__.ctx, k = window.__camSmoke;
        ctx.physics.removeCollider(k.col); k.mesh.removeFromParent(); k.mesh.geometry.dispose(); k.mesh.material.dispose();
        delete window.__camSmoke;
      });
      t.log(`pillar in front of her: Meme Cam framing rotated ${(w.off * 180 / Math.PI).toFixed(0)}°`);
    },
  },
  {
    name: 'camera:presets', order: 45, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      shotDir(t);
      await t.setMode('cutscene');
      const STATIC = { MEME_LOOP: MEME.pos, REVERSE_HORDE: [0.35, 0.55, -1.4], SELFIE: [0.25, 0.92, 0.45], ECU_EYES: [0, 0.79, 0.35], TWO_SHOT_LOW: [1.6, 0.75, 1.6], HERO_LOW: [0.8, 0.35, 2.2] };
      const FOV = { MEME_LOOP: MEME.fov, REVERSE_HORDE: 38, SELFIE: 50, ECU_EYES: 25, TWO_SHOT_LOW: 35, HERO_LOW: 40 };
      for (const [name, want] of Object.entries(STATIC)) {
        await t.G((n) => window.__GAME__.ctx.cam.preset(n, 'swordcat', { mode: 'cut' }), name);
        await t.frames(4);
        const s = await camState(t);
        const err = dist3(s.local, want);
        t.assert(err < 0.04, `${name}: camera off by ${err.toFixed(3)} m (local ${fmt(s.local)})`);
        t.assert(Math.abs(s.fov - FOV[name]) < 0.3, `${name}: fov ${s.fov.toFixed(1)}, expected ${FOV[name]}`);
        if (name === 'MEME_LOOP') t.assert(s.looping && s.memeT > 0, `MEME_LOOP shot: memeT ${s.memeT} (cape / grass loop sync)`);
        await t.shot(`camera/preset-${name}`);
      }
      // FLIGHT_ORBIT: r 9, h 2 around her, 8°/s
      await t.G(() => window.__GAME__.ctx.cam.preset('FLIGHT_ORBIT', 'swordcat'));
      await t.frames(3);
      const o1 = await camState(t), t1 = o1.shotT;                  // pose + shot clock sampled in the same frame
      await until(t, `c._cut.t >= ${t1 + 1.0}`, 20000);
      const o2 = await camState(t), t2 = o2.shotT;
      const r = Math.hypot(o2.local[0], o2.local[2]);
      const da = Math.abs(Math.atan2(o2.local[0], o2.local[2]) - Math.atan2(o1.local[0], o1.local[2])) * 180 / Math.PI, want = 8 * (t2 - t1);
      t.assert(Math.abs(r - 9) < 0.05 && Math.abs(o2.local[1] - 2) < 0.05, `orbit radius ${r.toFixed(2)} / height ${o2.local[1].toFixed(2)}`);
      t.assert(want > 1 && Math.abs(da - want) < 0.5, `orbit advanced ${da.toFixed(2)}° in ${(t2 - t1).toFixed(2)} s of shot time, expected ${want.toFixed(2)} (8°/s)`);
      await t.shot('camera/preset-FLIGHT_ORBIT');
      // SELFIE → WHIP_FALL (0.53 s): lands sideways in the grass
      await t.G(() => window.__GAME__.ctx.cam.preset('SELFIE', 'swordcat', { mode: 'cut' }));
      await t.frames(3);
      await t.G(() => { window.__camShot = window.__GAME__.ctx.cam.shot({ preset: 'WHIP_FALL', anchor: 'swordcat', dur: 0.53 }); });
      await until(t, 'c._cut.t >= 0.12', 5000);
      await t.shot('camera/whip-mid');
      await t.G(async () => { await window.__camShot; });
      await t.frames(2);
      let s = await camState(t);
      t.assert(Math.abs(s.roll - Math.PI / 2) < 0.01, `WHIP_FALL roll ${(s.roll * 180 / Math.PI).toFixed(1)}°, expected 90`);
      t.assert(Math.abs(s.pos[1] - s.ground - 0.12) < 0.03, `WHIP_FALL height above ground ${(s.pos[1] - s.ground).toFixed(3)}, expected 0.12`);
      t.assert(Math.abs(s.fov - 65) < 0.5, `WHIP_FALL fov ${s.fov.toFixed(1)}, expected 65`);
      await t.shot('camera/whipfall');
      // PULLBACK: MEME_LOOP → (0, 4, 14) over 6 s, FOV 38 → 50
      await t.G(() => { window.__camShot = window.__GAME__.ctx.cam.shot({ preset: 'PULLBACK', anchor: 'swordcat' }); });
      await until(t, 'c._cut.t >= 3.0', 20000);
      await t.shot('camera/pullback-mid');
      await t.G(async () => { await window.__camShot; delete window.__camShot; });
      await t.frames(2);
      s = await camState(t);
      t.assert(dist3(s.local, [0, 4, 14]) < 0.05, `PULLBACK end ${fmt(s.local)}, expected 0, 4, 14`);
      t.assert(Math.abs(s.fov - 50) < 0.3, `PULLBACK fov ${s.fov.toFixed(1)}, expected 50`);
      await t.shot('camera/pullback');
      // CRANE_DOWN along level anchors crane_bell → crane_field
      const done = await t.G(async () => { await window.__GAME__.ctx.cam.shot({ preset: 'CRANE_DOWN', path: ['crane_bell', 'crane_field'], dur: 2.5 }); return true; });
      t.assert(done === true, 'CRANE_DOWN promise');
      await t.frames(2);
      s = await camState(t);
      const field = await t.G(() => window.__GAME__.ctx.levels.anchor('crane_field').pos.toArray());
      t.assert(dist3(s.pos, field) < 0.1, `CRANE_DOWN ended at ${fmt(s.pos)}, expected crane_field ${fmt(field)}`);
      t.assert(Math.abs(s.fov - 40) < 0.3, `CRANE_DOWN fov ${s.fov.toFixed(1)}`);
      await t.shot('camera/crane');
      // handback: follow with the iso crane arc (CONTROLS_SPEC §2.6: 1.0 s)
      await t.setMode('play');
      const blending = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx.cam;
        c.mode('follow');
        await g.waitFrames(1);
        const b = c._blend;
        return b.active && Math.abs(b.dur - 1.0) < 1e-6 && b.t < b.dur;
      });
      t.assert(blending, 'handback was a cut, expected a 1.0 s blend');
      await until(t, '!c._blend.active', 5000);
      await t.frames(5);
      s = await camState(t);
      const isoD = await t.G(() => window.__GAME__.cam.iso().dist);
      t.assert(s.mode === 'follow' && isoD > 9, `handback: mode ${s.mode}, iso distance ${isoD.toFixed(2)}`);
      await t.shot('camera/handback');
      t.log('presets OK: static ×6, orbit, whip-fall, pull-back, crane rail, handback');
    },
  },
  {
    name: 'camera:shake', order: 47, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await t.frames(5);
      const r = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx.cam, cam = g.ctx.camera, THREE = g.THREE;
        g.ctx.bus.emit(g.E.SHAKE, { trauma: 0.8 });
        await g.waitFrames(3);
        const fwd = cam.getWorldDirection(new THREE.Vector3()), want = c._outPose.look.clone().sub(c._outPose.pos).normalize();
        const angle = fwd.angleTo(want);
        const trauma = c.shaker.trauma;
        for (let i = 0; i < 100 && c.shaker.trauma > 0; i++) await new Promise((res) => setTimeout(res, 50));
        return { angle, trauma, after: c.shaker.trauma };
      });
      t.assert(r.trauma > 0.5, `trauma ${r.trauma}`);
      t.assert(r.angle > 0.001, `shake did not rotate the camera (${r.angle})`);
      t.assert(r.after === 0, `trauma did not decay (${r.after})`);
      // a light hit (§8.2 0.15) must still visibly jolt the view: peak displacement of the look point 3.6 m ahead
      const light = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx.cam, cam = g.ctx.camera, THREE = g.THREE;
        c.shaker.reset();
        g.ctx.bus.emit(g.E.SHAKE, { trauma: 0.15 });
        let peak = 0;
        for (let i = 0; i < 12; i++) {
          await g.waitFrames(1);
          const want = c._outPose.look.clone().sub(c._outPose.pos).normalize();
          const at = cam.position.clone().addScaledVector(cam.getWorldDirection(new THREE.Vector3()), 3.6);
          const ideal = c._outPose.pos.clone().addScaledVector(want, 3.6);
          peak = Math.max(peak, at.distanceTo(ideal));
        }
        return peak;
      });
      t.assert(light > 0.02, `light hit shake moved the view only ${(light * 100).toFixed(1)} cm at 3.6 m`);
      t.log(`shake: ${(r.angle * 180 / Math.PI).toFixed(2)}° offset at trauma ${r.trauma.toFixed(2)}; light hit ${(light * 100).toFixed(1)} cm`);
    },
  },
  {
    name: 'camera:pullback-cs08', order: 45.5, level: 'gate', spawn: 'start', timeout: 180000,
    async run(t) {
      shotDir(t);
      // CS-08 shot 4 at the Line marker (0, +10), facing the fog (south): the rescued kittens stand in rows behind her
      await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE;
        for (const e of [...(ctx.enemies?.list ?? [])]) ctx.enemies.despawn(e);
        ctx.player.teleport({ pos: new THREE.Vector3(0, ctx.physics.heightAt(0, 10), 10), facing: Math.PI });
        await g.waitFrames(5);
      });
      await t.setMode('cutscene');
      await t.G(() => window.__GAME__.ctx.cam.shot({ preset: 'MEME_LOOP', anchor: 'swordcat', mode: 'cut' }));
      await t.frames(5);
      await t.shot('camera/cs08-meme', { freeze: true });
      await t.G(() => { window.__camShot = window.__GAME__.ctx.cam.shot({ preset: 'PULLBACK', anchor: 'swordcat' }); });
      await until(t, 'c._cut.t >= 3.0', 20000);
      const mid = await camState(t);
      await t.shot('camera/cs08-pullback-mid', { freeze: true });
      await t.G(async () => { await window.__camShot; delete window.__camShot; });
      await t.frames(2);
      const end = await camState(t);
      await t.shot('camera/cs08-pullback-end', { freeze: true });
      t.assert(mid.local[1] < 2.6, `mid-rail height ${mid.local[1].toFixed(2)} m: the dolly leads, the crane comes last`);
      t.assert(dist3(end.local, [0, 4, 14]) < 0.3 || end.dist < 14, `PULLBACK end ${fmt(end.local)}`);
      t.assert(Math.abs(end.fov - 50) < 0.3, `PULLBACK fov ${end.fov.toFixed(1)}`);
      t.assert(end.pos[1] >= end.ground + 0.1, 'rail below the terrain');
      // her (and the rows 2.5–4.5 m behind her) are inside the final frame
      const frame = await t.G(() => {
        const g = window.__GAME__, p = g.ctx.player, f = p.facing, out = [];
        for (const [lx, lz] of [[0, 0], [-2.5, -2.5], [2.5, -2.5], [-2.5, -4.5], [2.5, -4.5]]) {
          const v = new g.THREE.Vector3(p.pos.x + lx * Math.cos(f) + lz * Math.sin(f), p.pos.y + 0.4, p.pos.z - lx * Math.sin(f) + lz * Math.cos(f)).project(g.ctx.camera);
          out.push([v.x, v.y]);
        }
        return out;
      });
      for (const [x, y] of frame) t.assert(Math.abs(x) < 0.95 && Math.abs(y) < 0.95, `brigade point off screen (${x.toFixed(2)}, ${y.toFixed(2)})`);
      await t.setMode('play');
      await t.G(() => window.__GAME__.ctx.cam.mode('follow', { blend: false }));
      t.log(`CS-08 rail: mid ${fmt(mid.local)}, end ${fmt(end.local)}, fov ${end.fov.toFixed(1)}`);
    },
  },
];
