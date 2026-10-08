// tests/smoke/camera.mjs  (owner: camera) — follow / spring arm, Meme Cam (§7.8), lock-on (§8.3), boss distance,
// every §5.2 preset incl. WHIP_FALL / PULLBACK / CRANE_DOWN rails, cutscene handback, tree fade and shake.
// Screenshots → tests/shots/camera/*.png
import fs from 'node:fs';
import path from 'node:path';

const MEME = { pos: [0.06, 0.70, 1.15], fov: 32 };

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
    faded: c._fader.fadedCount, fadeUnits: c._fader.count,
  };
});

const fmt = (a) => a.map((v) => v.toFixed(2)).join(', ');
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function shotDir(t) { fs.mkdirSync(path.join(t.shotsDir, 'camera'), { recursive: true }); }

export default [
  {
    name: 'camera:follow', order: 40, level: 'meadow', spawn: 'start',
    async run(t) {
      shotDir(t);
      await t.frames(10);
      let s = await camState(t);
      t.assert(s.mode === 'follow', `mode ${s.mode}, expected follow`);
      t.assert(Math.abs(s.dist - 3.6) < 0.35, `follow arm ${s.dist.toFixed(2)} m, expected ~3.6`);
      t.assert(Math.abs(s.fov - 45) < 0.5, `fov ${s.fov}`);
      t.assert(s.local[2] < -2, `camera not behind her (local z ${s.local[2].toFixed(2)})`);
      t.assert(s.pos[1] >= s.ground + 0.25, 'camera below the terrain');
      await t.shot('camera/follow');
      const p0 = s.player;
      await t.hold('KeyW', 1500);
      await t.frames(20);
      s = await camState(t);
      const moved = Math.hypot(s.player[0] - p0[0], s.player[2] - p0[2]);
      t.assert(moved > 1, `player did not move (${moved.toFixed(2)} m)`);
      t.assert(Math.abs(s.dist - 3.6) < 0.4, `arm after running ${s.dist.toFixed(2)} m`);
      t.assert(s.local[2] < -2, 'camera stays behind her while running');
      await t.shot('camera/follow-run');
      t.log(`follow arm ${s.dist.toFixed(2)} m, pitch ${s.pitch.toFixed(2)}, moved ${moved.toFixed(1)} m`);
    },
  },
  {
    name: 'camera:collision', order: 41, level: 'meadow', spawn: 'start',
    async run(t) {
      shotDir(t);
      let minClear = Infinity, maxDist = 0;
      await t.G(() => { const c = window.__GAME__.ctx.cam; c.pitch = window.__GAME__.ctx.config.CAMERA.pitch[0]; });
      for (let i = 0; i < 8; i++) {
        await t.G((k) => { window.__GAME__.ctx.cam.yaw += (Math.PI * 2) / 8; }, i);
        await t.frames(12);
        const s = await camState(t);
        minClear = Math.min(minClear, s.pos[1] - s.ground); maxDist = Math.max(maxDist, s.dist);
      }
      t.assert(minClear >= 0.25, `camera went into the ground (clearance ${minClear.toFixed(2)} m)`);
      t.assert(maxDist < 3.6, `looking up from below: the spring arm should pull in (max ${maxDist.toFixed(2)} m)`);
      await t.shot('camera/collision-lowpitch');
      await t.G(() => { const c = window.__GAME__.ctx.cam; c.pitch = 0.2; c.snapBehind(); });
      t.log(`low pitch: min ground clearance ${minClear.toFixed(2)} m, arm ≤ ${maxDist.toFixed(2)} m`);
    },
  },
  {
    name: 'camera:meme', order: 42, level: 'meadow', spawn: 'start',
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
      await t.wait(2000);                                   // blend-in is 2.0 s
      const a = await camState(t);
      t.assert(a.mode === 'meme', `cam mode ${a.mode}`);
      t.assert(Math.abs(a.fov - MEME.fov) < 0.3, `meme fov ${a.fov.toFixed(1)}, expected 32`);
      const err = dist3(a.local, MEME.pos);
      t.assert(err < 0.02, `MEME_LOOP placement off by ${err.toFixed(3)} m (local ${fmt(a.local)})`);
      await t.shot('camera/meme');
      await t.blankCheck('camera/meme');
      await t.wait(500);
      const b = await camState(t);
      const sway = dist3(a.pos, b.pos);
      t.assert(sway > 0 && sway < 0.012, `meme sway ${sway.toFixed(4)} m (expected tiny, non-zero)`);
      t.assert(b.memeT >= 0 && b.memeT < 3.8, `memeT ${b.memeT}`);
      await t.clearEvents();
      await t.hold('KeyW', 120);                            // any input exits
      const off = await t.waitForEvent('camera:meme', 2000);
      t.assert(off && (await t.lastEvent('camera:meme'))?.on === false, 'input did not exit Meme Cam (camera:meme {on:false})');
      await t.wait(800);
      const c = await camState(t);
      t.assert(c.mode === 'follow', `after exit cam mode ${c.mode}`);
      t.assert(Math.abs(c.dist - 3.6) < 0.4, `after exit arm ${c.dist.toFixed(2)} m`);
      t.log(`meme local ${fmt(a.local)} fov ${a.fov.toFixed(1)}; sway ${(sway * 1000).toFixed(1)} mm/0.5 s`);
    },
  },
  {
    name: 'camera:lock', order: 43, level: 'meadow', spawn: 'start', timeout: 60000,
    async run(t) {
      shotDir(t);
      await t.G(() => window.__GAME__.god(true));
      // two rats ahead of her (she faces +Z at spawn 'start'): one centre-left, one to the right
      const ids = await t.G(() => {
        const g = window.__GAME__, p = g.ctx.player.pos, f = g.ctx.player.facing, s = Math.sin(f), c = Math.cos(f);
        const at = (fw, left) => [p.x + s * fw + c * left, p.z + c * fw - s * left];
        const a = g.spawn('rat_pike', ...at(5, 0.6)), b = g.spawn('rat_pike', ...at(6, -3));
        return [a.id, b.id];
      });
      await t.frames(5);
      await t.page.keyboard.press('Tab');
      await t.frames(4);
      let s = await camState(t);
      t.assert(s.lock != null, 'Tab did not lock on');
      t.assert(s.mode === 'lock', `cam mode ${s.mode}, expected lock`);
      await t.wait(900);
      s = await camState(t);
      t.assert(Math.abs(s.distance - 4.5) < 0.05, `lock distance ${s.distance.toFixed(2)}, expected 4.5`);
      await t.shot('camera/lock');
      const first = s.lock;
      await t.page.mouse.move(640, 360);
      await t.page.mouse.wheel(0, 120);                      // lockNext
      await t.frames(4);
      s = await camState(t);
      t.assert(s.lock != null && s.lock !== first, `wheel did not switch the lock (${first} → ${s.lock})`);
      await t.wait(500);
      await t.shot('camera/lock-switched');
      // the locked target leaves the world → hand over to the other one
      await t.G(() => { const g = window.__GAME__; g.ctx.enemies.despawn(g.ctx.cam.lockTarget); });
      await t.frames(4);
      s = await camState(t);
      t.assert(s.lock === first, `hand-over after despawn: lock ${s.lock}, expected ${first}`);
      // walk away beyond 16 m → the lock breaks
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; g.teleport(p.x, p.y, p.z - 25); });
      await t.frames(6);
      s = await camState(t);
      t.assert(s.lock === null && s.mode === 'follow', `lock did not break beyond 16 m (lock ${s.lock}, mode ${s.mode})`);
      await t.G(() => { const g = window.__GAME__; for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); g.god(false); });
      t.log(`locked ${first}, switched, handed over, broke at > 16 m (${ids.join(', ')})`);
    },
  },
  {
    name: 'camera:boss', order: 44, level: 'forest', spawn: 'boss', timeout: 60000,
    async run(t) {
      shotDir(t);
      await t.G(() => window.__GAME__.god(true));
      await t.G(() => window.__GAME__.startBoss());
      const started = await t.waitForEvent('boss:start', 3000);
      t.assert(started, 'startBoss() did not emit boss:start');
      await t.frames(2);
      let s = await camState(t);
      t.assert(s.mode === 'boss' || s.mode === 'lock', `cam mode ${s.mode}, expected boss`);
      await t.wait(900);
      s = await camState(t);
      t.assert(Math.abs(s.distance - 6.0) < 0.05, `boss distance ${s.distance.toFixed(2)}, expected 6.0`);
      await t.shot('camera/boss');
      await t.G(() => { const g = window.__GAME__; for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); g.god(false); });
      await t.frames(4);
      s = await camState(t);
      t.assert(s.mode === 'follow', `after the boss is gone cam mode ${s.mode}`);
      t.log(`boss arm ${s.distance.toFixed(2)} → follow`);
    },
  },
  {
    name: 'camera:presets', order: 45, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      shotDir(t);
      await t.setMode('cutscene');
      const STATIC = { MEME_LOOP: [0.06, 0.70, 1.15], REVERSE_HORDE: [0.35, 0.55, -1.4], SELFIE: [0.25, 0.92, 0.45], ECU_EYES: [0, 0.79, 0.35], TWO_SHOT_LOW: [1.6, 0.75, 1.6], HERO_LOW: [0.8, 0.35, 2.2] };
      const FOV = { MEME_LOOP: 32, REVERSE_HORDE: 38, SELFIE: 50, ECU_EYES: 25, TWO_SHOT_LOW: 35, HERO_LOW: 40 };
      for (const [name, want] of Object.entries(STATIC)) {
        await t.G((n) => window.__GAME__.ctx.cam.preset(n, 'swordcat', { mode: 'cut' }), name);
        await t.frames(4);
        const s = await camState(t);
        const err = dist3(s.local, want);
        t.assert(err < 0.04, `${name}: camera off by ${err.toFixed(3)} m (local ${fmt(s.local)})`);
        t.assert(Math.abs(s.fov - FOV[name]) < 0.3, `${name}: fov ${s.fov.toFixed(1)}, expected ${FOV[name]}`);
        await t.shot(`camera/preset-${name}`);
      }
      // FLIGHT_ORBIT: r 9, h 2 around her, 8°/s
      await t.G(() => window.__GAME__.ctx.cam.preset('FLIGHT_ORBIT', 'swordcat'));
      await t.frames(3);
      const o1 = await camState(t);
      await t.wait(1000);
      const o2 = await camState(t);
      const r = Math.hypot(o2.local[0], o2.local[2]), da = Math.abs(Math.atan2(o2.local[0], o2.local[2]) - Math.atan2(o1.local[0], o1.local[2]));
      t.assert(Math.abs(r - 9) < 0.05 && Math.abs(o2.local[1] - 2) < 0.05, `orbit radius ${r.toFixed(2)} / height ${o2.local[1].toFixed(2)}`);
      t.assert(da > 4 * Math.PI / 180 && da < 14 * Math.PI / 180, `orbit advanced ${(da * 180 / Math.PI).toFixed(1)}° in ~1 s, expected ~8`);
      await t.shot('camera/preset-FLIGHT_ORBIT');
      // SELFIE → WHIP_FALL (0.53 s): lands sideways in the grass
      await t.G(() => window.__GAME__.ctx.cam.preset('SELFIE', 'swordcat', { mode: 'cut' }));
      await t.frames(3);
      await t.G(() => { window.__GAME__.ctx.cam.shot({ preset: 'WHIP_FALL', anchor: 'swordcat', dur: 0.53 }); });
      await t.wait(150);
      await t.shot('camera/whip-mid');
      await t.wait(650);
      let s = await camState(t);
      t.assert(Math.abs(s.roll - Math.PI / 2) < 0.01, `WHIP_FALL roll ${(s.roll * 180 / Math.PI).toFixed(1)}°, expected 90`);
      t.assert(Math.abs(s.pos[1] - s.ground - 0.12) < 0.03, `WHIP_FALL height above ground ${(s.pos[1] - s.ground).toFixed(3)}, expected 0.12`);
      t.assert(Math.abs(s.fov - 65) < 0.5, `WHIP_FALL fov ${s.fov.toFixed(1)}, expected 65`);
      await t.shot('camera/whipfall');
      // PULLBACK: MEME_LOOP → (0, 4, 14) over 6 s, FOV 32 → 50
      await t.G(() => { window.__GAME__.ctx.cam.shot({ preset: 'PULLBACK', anchor: 'swordcat' }); });
      await t.wait(3000);
      await t.shot('camera/pullback-mid');
      await t.wait(3400);
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
      // handback: follow with a 0.6 s blend
      await t.setMode('play');
      await t.G(() => window.__GAME__.ctx.cam.mode('follow', { blend: 0.6 }));
      await t.wait(250);
      const mid = await camState(t);
      await t.wait(700);
      s = await camState(t);
      t.assert(s.mode === 'follow' && Math.abs(s.dist - 3.6) < 0.4, `handback: mode ${s.mode}, arm ${s.dist.toFixed(2)}`);
      t.assert(Math.abs(mid.dist - 3.6) > 0.1 || dist3(mid.pos, s.pos) > 0.1, 'handback was a cut, expected a 0.6 s blend');
      await t.shot('camera/handback');
      t.log('presets OK: static ×6, orbit, whip-fall, pull-back, crane rail, handback');
    },
  },
  {
    name: 'camera:treefade', order: 46, level: 'meadow', spawn: 'start',
    async run(t) {
      shotDir(t);
      // the M0 stub trees are unnamed InstancedMeshes: tag them the way world will (userData.camFade)
      const info = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, root = ctx.levels.current.root;
        let trunks = null, n = 0;
        root.traverse((o) => {
          if (!o.isInstancedMesh) return;
          const type = o.geometry?.type;
          if (type === 'CylinderGeometry' || type === 'IcosahedronGeometry') {
            o.userData.camFade = true; n += ctx.cam.addFadeable(o);
            if (type === 'CylinderGeometry') trunks = o;
          }
        });
        if (!trunks) return { n, ok: false };
        // nearest trunk to the player
        const m = new THREE.Matrix4(), p = new THREE.Vector3(), pp = ctx.player.pos;
        let best = null, bd = Infinity;
        for (let i = 0; i < trunks.count; i++) {
          trunks.getMatrixAt(i, m); p.setFromMatrixPosition(m);
          const d = Math.hypot(p.x - pp.x, p.z - pp.z);
          if (d < bd) { bd = d; best = p.clone(); }
        }
        // stand 2.2 m from the trunk, facing away from it: the follow camera ends up behind the trunk
        const dir = new THREE.Vector3(pp.x - best.x, 0, pp.z - best.z).normalize();
        const x = best.x + dir.x * 2.2, z = best.z + dir.z * 2.2;
        ctx.player.teleport({ pos: new THREE.Vector3(x, ctx.physics.heightAt(x, z), z), facing: Math.atan2(dir.x, dir.z) });
        ctx.cam.snapBehind();
        return { n, ok: true, trunk: best.toArray() };
      });
      t.assert(info.ok && info.n > 10, `could not tag stub trees (${info.n} units)`);
      if (!info.ok) return;
      await t.G(() => { window.__GAME__.ctx.cam._fader.enabled = false; });
      await t.frames(30);
      await t.shot('camera/treefade-off');
      await t.G(() => { window.__GAME__.ctx.cam._fader.enabled = true; });
      await t.frames(40);
      const s = await camState(t);
      t.assert(s.faded > 0, `no fadeable was faded with a trunk between camera and player (units ${s.fadeUnits})`);
      await t.shot('camera/treefade');
      // walk away: everything restores
      await t.G(() => { const g = window.__GAME__, p = g.ctx.player; g.ctx.cam.yaw = p.facing; g.ctx.cam.snapBehind(); g.ctx.cam.yaw += Math.PI; });
      await t.frames(40);
      t.log(`tree fade: ${s.faded} faded of ${s.fadeUnits} units`);
    },
  },
  {
    name: 'camera:shake', order: 47, level: 'meadow', spawn: 'start',
    async run(t) {
      await t.frames(5);
      const r = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx.cam, cam = g.ctx.camera, THREE = g.THREE;
        g.ctx.bus.emit(g.E.SHAKE, { trauma: 0.8 });
        await g.waitFrames(3);
        const fwd = cam.getWorldDirection(new THREE.Vector3()), want = c._outPose.look.clone().sub(c._outPose.pos).normalize();
        const angle = fwd.angleTo(want);
        const trauma = c.shaker.trauma;
        await new Promise((res) => setTimeout(res, 900));
        return { angle, trauma, after: c.shaker.trauma };
      });
      t.assert(r.trauma > 0.5, `trauma ${r.trauma}`);
      t.assert(r.angle > 0.001, `shake did not rotate the camera (${r.angle})`);
      t.assert(r.after === 0, `trauma did not decay (${r.after})`);
      t.log(`shake: ${(r.angle * 180 / Math.PI).toFixed(2)}° offset at trauma ${r.trauma.toFixed(2)}`);
    },
  },
];
