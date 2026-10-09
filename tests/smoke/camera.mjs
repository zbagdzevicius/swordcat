// tests/smoke/camera.mjs  (owner: camera) — follow / spring arm, Meme Cam (§7.8), lock-on (§8.3), boss distance,
// every §5.2 preset incl. WHIP_FALL / PULLBACK / CRANE_DOWN rails, cutscene handback, tree fade and shake.
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
    name: 'camera:follow', order: 40, level: 'meadow', spawn: 'start', timeout: 150000,
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
      // run forward (in chunks: a loaded machine can stall the first frames after a level load)
      let moved = 0;
      for (let i = 0; i < 6 && moved < 3; i++) {
        await t.hold('KeyW', 800);
        s = await camState(t);
        moved = Math.hypot(s.player[0] - p0[0], s.player[2] - p0[2]);
      }
      await t.frames(20);
      s = await camState(t);
      moved = Math.hypot(s.player[0] - p0[0], s.player[2] - p0[2]);
      t.assert(moved > 1, `player did not move (${moved.toFixed(2)} m)`);
      t.assert(Math.abs(s.dist - 3.6) < 0.4, `arm after running ${s.dist.toFixed(2)} m`);
      t.assert(s.local[2] < -2, 'camera stays behind her while running');
      await t.shot('camera/follow-run');
      t.log(`follow arm ${s.dist.toFixed(2)} m, pitch ${s.pitch.toFixed(2)}, moved ${moved.toFixed(1)} m`);
    },
  },
  {
    name: 'camera:collision', order: 41, level: 'meadow', spawn: 'start', timeout: 150000,
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

      // a solid wall (box collider) behind her pulls the arm in; a thin post (r 0.25) does not (it would fade)
      await t.frames(20);
      const setup = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, c = ctx.cam, cam = ctx.camera;
        c.avoid = false;                    // the raw spring arm first (boom avoidance below)
        const d = new THREE.Vector3().subVectors(cam.position, c.pivot); d.y = 0; d.normalize();
        const at = (h) => ({ x: c.pivot.x + d.x * h, z: c.pivot.z + d.z * h });
        const w = at(3.0), gy = ctx.physics.heightAt(w.x, w.z);
        const wall = { x: w.x, z: w.z, hx: 0.8, hz: 0.8, y0: gy - 1, y1: gy + 5, smokeCam: true };
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 6, 1.6), new THREE.MeshStandardMaterial({ color: '#8E8A80' }));
        mesh.position.set(w.x, gy + 2, w.z); mesh.name = 'smoke:wall'; ctx.scene.add(mesh);
        ctx.physics.addCollider(wall);
        window.__camSmoke = { wall, mesh };
        return { wall: [w.x, w.z] };
      });
      await t.frames(30);
      let s = await camState(t);
      t.assert(s.dist > 1.5 && s.dist < 2.35, `wall 2.2 m behind (near face): arm ${s.dist.toFixed(2)} m, expected ~2.0`);
      const inside = Math.abs(s.pos[0] - setup.wall[0]) < 0.8 && Math.abs(s.pos[2] - setup.wall[1]) < 0.8;
      t.assert(!inside, 'camera ended inside the wall');
      await t.shot('camera/collision-wall');
      const wallDist = s.dist;
      // boom avoidance on: a 2 m arm is too short, the orbit swings round the 1.6 m pillar to a clear side
      await t.G(() => { window.__GAME__.ctx.input.lookIdleTime = 5; window.__GAME__.ctx.cam.avoid = true; });
      await t.frames(60);
      s = await camState(t);
      t.assert(s.dist > 2.6, `boom avoidance: arm ${s.dist.toFixed(2)} m beside the pillar, expected > 2.6`);
      const swungDist = s.dist;
      await t.shot('camera/collision-wall-avoid');
      await t.G(() => { window.__GAME__.ctx.cam.avoid = false; });
      await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, c = ctx.cam, cam = ctx.camera, k = window.__camSmoke;
        ctx.physics.removeCollider(k.wall); k.mesh.removeFromParent(); k.mesh.geometry.dispose(); k.mesh.material.dispose();
        const d = new THREE.Vector3().subVectors(cam.position, c.pivot); d.y = 0; d.normalize();
        const x = c.pivot.x + d.x * 1.8, z = c.pivot.z + d.z * 1.8, gy = ctx.physics.heightAt(x, z);
        const post = { x, z, r: 0.25, y0: gy - 1, y1: gy + 4 };
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 10), new THREE.MeshStandardMaterial({ color: '#5A4632' }));
        mesh.position.set(x, gy + 2, z); ctx.scene.add(mesh);
        ctx.physics.addCollider(post);
        window.__camSmoke = { post, mesh };
      });
      await t.frames(90);
      s = await camState(t);
      t.assert(Math.abs(s.dist - 3.6) < 0.2, `a thin post must not pull the arm in (arm ${s.dist.toFixed(2)} m)`);
      await t.G(() => {
        const ctx = window.__GAME__.ctx, k = window.__camSmoke;
        ctx.physics.removeCollider(k.post); k.mesh.removeFromParent(); k.mesh.geometry.dispose(); k.mesh.material.dispose();
        delete window.__camSmoke;
        window.__GAME__.ctx.cam.avoid = true;
      });
      t.log(`wall: arm ${wallDist.toFixed(2)} m (avoidance: ${swungDist.toFixed(2)} m); thin post: arm ${s.dist.toFixed(2)} m`);
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
      t.assert(Math.abs(c.dist - 3.6) < 0.4, `after exit arm ${c.dist.toFixed(2)} m`);
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
    name: 'camera:lock', order: 43, level: 'meadow', spawn: 'start', timeout: 150000,
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
      await until(t, 'Math.abs(c.distance - 4.5) < 0.01', 5000);
      s = await camState(t);
      t.assert(Math.abs(s.distance - 4.5) < 0.05, `lock distance ${s.distance.toFixed(2)}, expected 4.5`);
      // the locked rat stands clear of her on screen (beside her, not hidden behind her head)
      await t.frames(40);
      const fr = await t.G(() => {
        const g = window.__GAME__, c = g.ctx.cam, cam = g.ctx.camera, T = g.THREE, tg = c.lockTarget, p = g.ctx.player, W = window.innerWidth;
        const px = (v) => (v.clone().project(cam).x * 0.5 + 0.5) * W;
        return { W, tgt: px(new T.Vector3(tg.pos.x, tg.pos.y + (tg.height ?? 1) * 0.55, tg.pos.z)), head: px(new T.Vector3(p.pos.x, p.pos.y + 0.75, p.pos.z)), pitch: c._gamePose.pos.y - c.pivot.y };
      });
      const sepPx = Math.abs(fr.tgt - fr.head) * (1280 / fr.W);
      t.assert(sepPx > 120, `locked target only ${sepPx.toFixed(0)} px from her head (at 1280 wide), expected > 120`);
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
      t.log(`locked ${first} (${sepPx.toFixed(0)} px beside her), switched, handed over, broke at > 16 m (${ids.join(', ')})`);
    },
  },
  {
    name: 'camera:handover', order: 43.5, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      shotDir(t);
      // the locked rat dies with one rat ahead-right and one behind her: the lock passes to the one in view, and when
      // only the one behind is left the orbit turns to it at <= 180°/s (review: 124° in one 100 ms sample)
      const r = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, c = ctx.cam;
        g.god(true);
        for (const e of [...(ctx.enemies?.list ?? [])]) ctx.enemies.despawn(e);
        const p = ctx.player.pos, f = ctx.player.facing, s = Math.sin(f), co = Math.cos(f);
        const at = (fw, left) => [p.x + s * fw + co * left, p.z + co * fw - s * left];
        const a = g.spawn('rat_pike', ...at(4, 0)), side = g.spawn('rat_pike', ...at(5, -2.5)), behind = g.spawn('rat_pike', ...at(-3, 0.5));
        for (const e of [a, side, behind]) e.ai = false;                   // passive (combat smoke idiom)
        await g.waitFrames(5);
        c.lock(a);
        await g.waitFrames(60);
        const steps = [], ids = [];
        let maxStep = 0, prev = c.yaw;
        const sample = async (n) => {
          for (let i = 0; i < n; i++) {
            await g.waitFrames(1);
            const d = Math.abs(Math.atan2(Math.sin(c.yaw - prev), Math.cos(c.yaw - prev)));
            maxStep = Math.max(maxStep, d); steps.push([d, performance.now()]); prev = c.yaw;
          }
        };
        ctx.enemies.despawn(a); await sample(30); ids.push(c.lockTarget?.id ?? null);
        ctx.enemies.despawn(side);
        const t0 = performance.now(); await sample(90); const secs = (performance.now() - t0) / 1000;
        ids.push(c.lockTarget?.id ?? null);
        // the turn in any 100 ms (wall clock) window after the second hand-over
        let win = 0;
        for (let i = 30; i < steps.length; i++) {
          let sum = 0;
          for (let j = i; j < steps.length && steps[j][1] - steps[i][1] <= 100; j++) sum += steps[j][0];
          win = Math.max(win, sum);
        }
        const out = { ids, want: [side.id, behind.id], win, secs };
        for (const e of [...(ctx.enemies?.list ?? [])]) ctx.enemies.despawn(e);
        g.god(false);
        return out;
      });
      t.assert(r.ids[0] === r.want[0], `hand-over picked ${r.ids[0]}, expected the rat in view ${r.want[0]}`);
      t.assert(r.ids[1] === r.want[1], `second hand-over picked ${r.ids[1]}, expected ${r.want[1]}`);
      // 180°/s ≈ 18° per 100 ms (+ slack: a frame straddling the window edge, frame dt clamped at 0.1 s)
      t.assert(r.win < 0.6, `orbit turned ${(r.win * 180 / Math.PI).toFixed(0)}° within 100 ms after the hand-over`);
      t.log(`hand-over: in-view first, then behind; max ${(r.win * 180 / Math.PI).toFixed(0)}° per 100 ms`);
    },
  },
  {
    name: 'camera:boss', order: 44, level: 'forest', spawn: 'boss', timeout: 150000,
    async run(t) {
      shotDir(t);
      await t.G(() => window.__GAME__.god(true));
      await t.G(() => window.__GAME__.startBoss());
      const started = await t.waitForEvent('boss:start', 20000);       // the boss GLB may still be loading
      t.assert(started, 'startBoss() did not emit boss:start');
      if (!started) return;
      await t.frames(2);
      let s = await camState(t);
      t.assert(s.mode === 'boss' || s.mode === 'lock', `cam mode ${s.mode}, expected boss`);
      await until(t, 'Math.abs(c.distance - 6.0) < 0.01', 5000);
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
      // handback: follow with a 0.6 s blend
      await t.setMode('play');
      const blending = await t.G(async () => {
        const g = window.__GAME__, c = g.ctx.cam;
        c.mode('follow', { blend: 0.6 });
        await g.waitFrames(1);
        const b = c._blend;
        return b.active && Math.abs(b.dur - 0.6) < 1e-6 && b.t < b.dur;
      });
      t.assert(blending, 'handback was a cut, expected a 0.6 s blend');
      await until(t, '!c._blend.active', 5000);
      await t.frames(5);
      s = await camState(t);
      t.assert(s.mode === 'follow' && Math.abs(s.dist - 3.6) < 0.4, `handback: mode ${s.mode}, arm ${s.dist.toFixed(2)}`);
      await t.shot('camera/handback');
      t.log('presets OK: static ×6, orbit, whip-fall, pull-back, crane rail, handback');
    },
  },
  {
    name: 'camera:treefade', order: 46, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      shotDir(t);
      // the level's fadeable trees (world tags them userData.camFade; the camera registers them on level:loaded).
      // Pick the nearest tree whose trunk collider the spring arm skips (camTransparent), stand 2.4 m in front of
      // it facing away: the follow camera ends up behind the trunk.
      const info = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, fader = ctx.cam._fader, pp = ctx.player.pos;
        if (!fader.count) {                                     // stub levels: tag the primitive trees like world does
          ctx.levels.current.root.traverse((o) => {
            const ty = o.geometry?.type;
            if (o.isInstancedMesh && (ty === 'CylinderGeometry' || ty === 'IcosahedronGeometry')) { o.userData.camFade = true; ctx.cam.addFadeable(o); }
          });
        }
        const circles = ctx.levels.current.colliders?.circles ?? [];
        const p = new THREE.Vector3();
        let best = null, bd = Infinity;
        for (const u of fader.units) {
          const part = u.parts[0];
          if (part.kind !== 'inst' && part.kind !== 'batch') continue;
          p.setFromMatrixPosition(part.world);
          let col = null, cd = 1.0;
          for (const c of circles) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < cd) { cd = d; col = c; } }
          if (col && !(col.r <= 0.6 || col.cam === false || col.camFade === true)) continue;   // a trunk that blocks the arm
          const d = Math.hypot(p.x - pp.x, p.z - pp.z) + (/tree/i.test(u.root.name ?? '') ? 0 : 1000);   // trees first
          if (d < bd) { bd = d; best = { pos: p.clone(), r: col?.r ?? 0, name: u.root.name }; }
        }
        if (!best) return { n: fader.count, ok: false };
        let dir = new THREE.Vector3(pp.x - best.pos.x, 0, pp.z - best.pos.z);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        dir.normalize();
        const x = best.pos.x + dir.x * 2.4, z = best.pos.z + dir.z * 2.4;
        ctx.player.teleport({ pos: new THREE.Vector3(x, ctx.physics.heightAt(x, z), z), facing: Math.atan2(dir.x, dir.z) });
        ctx.cam.snapBehind();
        return { n: fader.count, ok: true, tree: best.name, trunkR: best.r };
      });
      t.assert(info.ok && info.n > 10, `no fadeable trees registered (${info.n} units)`);
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
      t.log(`tree fade: ${s.faded} faded of ${s.fadeUnits} units (${info.tree}, trunk r ${info.trunkR.toFixed(2)})`);
    },
  },
  {
    name: 'camera:fence', order: 46.5, level: 'meadow', spawn: 'practice', timeout: 150000,
    async run(t) {
      shotDir(t);
      // just inside the practice field's north fence, facing into the field: the follow camera sits outside, the rails
      // run across the lens. Every fence unit right in front of the lens (within ~2 m) must fade.
      const r = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, c = ctx.cam;
        g.god(true);
        for (const e of [...(ctx.enemies?.list ?? [])]) ctx.enemies.despawn(e);
        const x = 6, z = -61.3;
        ctx.player.teleport({ pos: new THREE.Vector3(x, ctx.physics.heightAt(x, z), z), facing: Math.PI });
        c.snapBehind();
        await g.waitFrames(40);
        const cam = ctx.camera, fd = c._fader, p = new THREE.Vector3(), cp = cam.position;
        let near = 0, faded = 0;
        for (const u of fd.units) {
          if (!/fence/i.test(u.root?.name ?? '')) continue;
          const part = u.parts[0];
          const box = part.box.clone().applyMatrix4(part.world);
          box.getCenter(p).applyMatrix4(cam.matrixWorldInverse);
          if (box.distanceToPoint(cp) > 2.4 || p.z > 0) continue;            // within ~2 m in front of the lens (+ margin)
          near++; if (u.f > 0.5) faded++;
        }
        return { near, faded, cam: cp.toArray(), n: fd.count };
      });
      await t.shot('camera/fence');
      t.assert(r.near > 0, `no fence piece near the lens (camera ${fmt(r.cam)}, ${r.n} fade units)`);
      t.assert(r.faded === r.near, `fence pieces at the lens left opaque: ${r.near - r.faded} of ${r.near}`);
      await t.G(() => window.__GAME__.god(false));
      t.log(`fence at the lens: ${r.faded}/${r.near} pieces faded`);
    },
  },
  {
    name: 'camera:obstacles', order: 46.7, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      shotDir(t);
      // a low drystone wall, a standing stone and Mochi's cart right behind her: the boom lifts over / swings round
      // the obstacle instead of collapsing onto her head (review: camera at 0.8-1.1 m, back of the head only)
      const spots = [
        { name: 'wall', x: -17.87, z: -40.78, facing: Math.atan2(0.73, 0.68) },
        { name: 'stone', x: -20, z: 7.84, facing: 0 },
        { name: 'cart', x: 31.8, z: 74, facing: Math.PI / 2 },
      ];
      await t.G(() => { const g = window.__GAME__; g.ctx.state.setFlag('prologue.done', true); g.god(true); });
      for (const sp of spots) {
        const r = await t.G(async (sp) => {
          const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, c = ctx.cam;
          for (const e of [...(ctx.enemies?.list ?? [])]) ctx.enemies.despawn(e);
          ctx.player.teleport({ pos: new THREE.Vector3(sp.x, ctx.physics.heightAt(sp.x, sp.z), sp.z), facing: sp.facing });
          c.recenter();
          await g.waitFrames(90);
          const cam = ctx.camera, pp = ctx.player.object3d.position;
          const v = new THREE.Vector3(pp.x, pp.y + 0.35, pp.z).project(cam);          // her chest on screen
          return { dist: cam.position.distanceTo(c.pivot), h: cam.position.y - pp.y, chestY: v.y, chestX: v.x, yaw: c.yaw, avoid: c._avoidPitch };
        }, sp);
        await t.shot(`camera/obstacle-${sp.name}`);
        const after = await t.G(async () => {
          const g = window.__GAME__, ctx = g.ctx, c = ctx.cam;
          let min = Infinity;
          for (let i = 0; i < 12; i++) {
            for (let k = 0; k < 10; k++) { await g.waitFrames(1); min = Math.min(min, ctx.camera.position.distanceTo(c.pivot)); }
          }
          return { min };
        });
        t.assert(after.min >= 1.8, `${sp.name}: boom dipped to ${after.min.toFixed(2)} m over the next 2 s`);
        t.log(`${sp.name}: min boom over 2 s ${after.min.toFixed(2)} m`);
        t.assert(r.dist >= 1.8, `${sp.name}: boom collapsed to ${r.dist.toFixed(2)} m (min 1.8)`);
        t.assert(Math.abs(r.chestY) < 0.95 && Math.abs(r.chestX) < 0.95, `${sp.name}: her chest is off screen (${r.chestX.toFixed(2)}, ${r.chestY.toFixed(2)})`);
        t.log(`${sp.name}: boom ${r.dist.toFixed(2)} m, cam ${r.h.toFixed(2)} m over her, lift ${r.avoid.toFixed(2)} rad`);
      }
      await t.G(() => window.__GAME__.god(false));
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
  // ---------------------------------------------------------------- M2: bosses, CS-08 rail, town occlusion
  {
    name: 'camera:boss-frame', order: 44.2, level: 'forest', spawn: 'boss', timeout: 180000,
    async run(t) {
      shotDir(t);
      // B1 (forest mill) and B2 (gate causeway): 6.0 m arm; the boss assist brings an off-screen boss into frame
      for (const L of [{ level: 'forest', id: 'B1' }, { level: 'gate', id: 'B2' }]) {
        if (L.level !== 'forest') await t.loadLevel(L.level, 'boss');
        await t.clearEvents();                                     // B1's boss:start must not satisfy B2's wait
        await t.G(() => window.__GAME__.god(true));
        await t.G(() => window.__GAME__.startBoss());
        const started = await t.waitForEvent('boss:start', 25000);
        t.assert(started, `${L.id}: startBoss() did not emit boss:start`);
        if (!started) continue;
        await until(t, 'c.ctx.enemies.boss && c.ctx.enemies.boss.alive && Math.abs(c.distance - (c.ctx.enemies.boss.camDist || 6.0)) < 0.01', 8000);
        // put the boss 7 m to her right, freeze his AI, swing the camera so he is off screen
        const r0 = await t.G(async () => {
          const g = window.__GAME__, ctx = g.ctx, c = ctx.cam, b = ctx.enemies.boss, p = ctx.player;
          if (!b) return null;
          b.ai = false;
          const f = p.facing;
          // B1's mill is round: the boss 7 m to her right, camera behind her. B2's causeway is only 12 m wide (a boss
          // put 7 m to the side is pushed back next to her): the boss 7 m ahead, the camera swung 90° to the side.
          const narrow = ctx.levels.current?.id === 'gate';
          const x = narrow ? p.pos.x + Math.sin(f) * 7 : p.pos.x - Math.cos(f) * 7, z = narrow ? p.pos.z + Math.cos(f) * 7 : p.pos.z + Math.sin(f) * 7;
          b.pos.set(x, ctx.physics.heightAt(x, z), z); b.object3d.position.copy(b.pos);
          b.vel?.set?.(0, 0, 0);
          c.yaw = f + Math.PI + (narrow ? Math.PI / 2 : 0);       // the boss is at ~90° off the view
          await g.waitFrames(2);
          return { dist: c.distance, mode: c.modeName, h: b.height };
        });
        t.assert(r0 && (r0.mode === 'boss' || r0.mode === 'lock'), `${L.id}: cam mode ${r0?.mode}`);
        const ok = await until(t, `(() => { const b = c.ctx.enemies.boss, p = c.ctx.player.pos, cam = c.ctx.camera.position;
          const f = Math.atan2(p.x - cam.x, p.z - cam.z), a = Math.atan2(b.pos.x - cam.x, b.pos.z - cam.z);
          return Math.abs(Math.atan2(Math.sin(a - f), Math.cos(a - f))) <= 0.40; })()`, 15000);
        t.assert(ok, `${L.id}: boss assist did not bring the boss into frame`);
        const s = await camState(t);
        const onScreen = await t.G(() => {
          const g = window.__GAME__, b = g.ctx.enemies.boss, v = b.object3d.position.clone(); v.y += b.height * 0.6;
          v.project(g.ctx.camera);
          return [v.x, v.y];
        });
        t.assert(Math.abs(onScreen[0]) < 0.95 && Math.abs(onScreen[1]) < 0.95, `${L.id}: boss chest off screen (${fmt(onScreen)})`);
        t.assert(Math.abs(s.distance - 6.0) < 0.6, `${L.id}: arm ${s.distance.toFixed(2)}`);
        await t.shot(`camera/boss-${L.id}`, { freeze: true });
        // BOSS_INTRO reveal (height-scaled) on the boss
        await t.setMode('cutscene');
        await t.G(() => { const g = window.__GAME__; g.ctx.cam.shot({ preset: 'BOSS_INTRO', anchor: g.ctx.enemies.boss, mode: 'cut' }); });
        await t.frames(4);
        const intro = await t.G(() => {
          const g = window.__GAME__, b = g.ctx.enemies.boss, v = b.object3d.position.clone(); v.y += b.height * 0.8;
          v.project(g.ctx.camera);
          return { head: [v.x, v.y], mode: g.ctx.cam.modeName };
        });
        t.assert(intro.mode === 'preset' && Math.abs(intro.head[0]) < 0.9 && Math.abs(intro.head[1]) < 0.95, `${L.id}: BOSS_INTRO head ${fmt(intro.head)}`);
        await t.shot(`camera/boss-intro-${L.id}`, { freeze: true });
        await t.setMode('play');
        await t.G(() => { const g = window.__GAME__; g.ctx.cam.mode('follow', { blend: false }); for (const e of [...g.ctx.enemies.list]) g.ctx.enemies.despawn(e); g.god(false); });
        await t.frames(4);
        t.log(`${L.id}: assist framed the boss at (${fmt(onScreen)}), arm ${s.distance.toFixed(2)}, intro head (${fmt(intro.head)})`);
      }
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
  {
    name: 'camera:town-occlusion', order: 46.8, level: 'town', spawn: 'hub', timeout: 180000,
    async run(t) {
      shotDir(t);
      const info = await t.G(() => {
        const c = window.__GAME__.ctx.cam;
        return { solids: c.solidOccluders, units: c._fader.count };
      });
      t.assert(info.solids >= 6, `town: only ${info.solids} solid occluders registered (houses, castle, tower)`);
      await t.shot('camera/town-follow', { freeze: true });
      // a house between the lens and her: stand 2 m in front of the nearest house, frame her from beyond it
      const r = await t.G(async () => {
        const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, c = ctx.cam, f = c._fader;
        const p0 = ctx.player.pos;
        let best = null;
        for (const u of f.units) {
          if (!u.solid || u.radius < 3 || u.radius > 9) continue;
          const d = Math.hypot(u.center.x - p0.x, u.center.z - p0.z);
          if (!best || d < best.d) best = { u, d };
        }
        if (!best) return null;
        const u = best.u, box = new THREE.Box3();
        for (const pt of u.parts) box.union(pt.box.clone().applyMatrix4(pt.world));
        // walk out of the house (from its centre toward the hub) until the ground is free
        const dir = new THREE.Vector3(p0.x - u.center.x, 0, p0.z - u.center.z).normalize();
        const size = box.getSize(new THREE.Vector3());
        const out = Math.max(size.x, size.z) / 2 + 1.5;
        const x = u.center.x + dir.x * out, z = u.center.z + dir.z * out;
        ctx.player.teleport({ pos: new THREE.Vector3(x, ctx.physics.heightAt(x, z), z), facing: Math.atan2(dir.x, dir.z) });
        await g.waitFrames(30);
        // lens beyond the house on the far side, 3 m above its roof line, looking at her
        const back = Math.max(size.x, size.z) / 2 + 1.0;
        const cx = u.center.x - dir.x * back, cz = u.center.z - dir.z * back, cy = box.min.y + (box.max.y - box.min.y) * 0.6;
        g.setMode('cutscene');
        const pp = ctx.player.object3d.position, fc = ctx.player.facing, co = Math.cos(fc), s = Math.sin(fc);
        const dx = cx - pp.x, dz = cz - pp.z;
        c.shot({ anchor: 'swordcat', mode: 'cut', pos: [dx * co - dz * s, cy - pp.y, dx * s + dz * co], look: [0, 0.6, 0], fov: 40 });
        await g.waitFrames(40);
        const subj = [pp.clone().setY(pp.y + 0.5), pp.clone().setY(pp.y + 1.05)];
        const dbg = { cam: ctx.camera.position.toArray().map((v) => +v.toFixed(2)), her: pp.toArray().map((v) => +v.toFixed(2)), center: u.center.toArray().map((v) => +v.toFixed(2)),
          r: u.radius, parts: u.parts.length, precise: u.precise, box: [box.min.toArray(), box.max.toArray()].flat().map((v) => +v.toFixed(1)),
          occ: f._occludes(u, ctx.camera.position, subj, 2), hit: u.hit, f: u.f, d2: ctx.camera.position.distanceTo(subj[0]), mode: c.modeName };
        return { faded: f.fadedSolidCount, d: best.d, top: box.max.y, dbg };
      });
      t.assert(r, 'no house-sized solid occluder near the hub spawn');
      if (!r) return;
      t.assert(r.faded >= 1, `a house hiding her did not fade (faded solids ${r.faded}) ${JSON.stringify(r.dbg)}`);
      await t.shot('camera/town-house-fade', { freeze: true });
      await t.setMode('play');
      await t.G(() => window.__GAME__.ctx.cam.mode('follow', { blend: false }));
      // back to follow: the arm still collides with houses (never inside / behind a wall), she stays on screen
      await t.G(async () => { const g = window.__GAME__; g.ctx.cam.yaw = g.ctx.player.facing + Math.PI; await g.waitFrames(60); });
      const s = await camState(t);
      const chest = await t.G(() => { const g = window.__GAME__, v = g.ctx.player.object3d.position.clone(); v.y += 0.35; v.project(g.ctx.camera); return [v.x, v.y]; });
      t.assert(Math.abs(chest[0]) < 0.95 && Math.abs(chest[1]) < 0.95, `town follow: her chest off screen ${fmt(chest)}`);
      t.assert(s.dist >= 0.75, `arm ${s.dist.toFixed(2)}`);
      await t.shot('camera/town-follow-wall', { freeze: true });
      t.log(`town: ${info.solids} solid occluders; house fade ok (faded ${r.faded}); follow facing the house: arm ${s.dist.toFixed(2)} m, faded now ${s.faded}`);
    },
  },
];
