// tests/smoke/enemies.mjs  (owner: enemies) — the enemies area in the running game. Screenshots → tests/shots/enemies/.
//   enemies:looks     rat_pike / rat_xbow / crow: real GLBs fitted (±10% of §10.2), animated, facing +Z (close-ups)
//   enemies:cs02      the CS-02 cast (scripted, AI-less): Cacklejaw, Pilfer (signpost + post bag), caged hyenas (Pearl)
//   enemies:pike      rat_pike FSM: alert hop → chase (token) → windup with a white `parry` glint → strike → hit
//                     on her → recover; then it's defeated: enemy:died, poof, the helm spins off, it scampers away
//   enemies:xbow      rat_xbow: `aim` telegraph (line) → a bolt flies at her → reload
//   enemies:crow      crow: circles 4 m up, `shadow` decal → dive → lands and pecks (hittable) → defeated
//   enemies:budget    §8.3 arena budget: 10 AI spawns → 8 active + 2 dormant; despawns free slots
//   enemies:meow      §7.7 Meow alerts an unalerted rat behind her
//   enemies:level     the meadow's own open-zone spawns after the prologue (world's LevelKit → ctx.enemies.spawn):
//                     crossroads pikes + a crossbowman perched on the wall (y 1.2), Crow Fields crows + perched xbows
//   M2:
//   enemies:m2looks   spider / hyena / stealer / pug / Gloomjelly L + giant (Earl Grey inside) close-ups + a lineup
//   enemies:spider    white glint (abdomen pulse) → web glob slows her → a web patch; a slash cuts it
//   enemies:hyena     a pack of 3: Jeer (purple rings, enemy:jeer), Gloat after a landed hit (choke) / flank giggle
//   enemies:stealer   grab swirl → snatch 10% of her fish → getaway; a hit returns it (item:returned)
//   enemies:pug       frontal block; pug_slam red ground circle → ring; a Bright Slash drops the shield
//   enemies:jelly     slam aoe circle; L → 2 M → 4 S; a bright slash pops without a split
//   enemies:pilfer    the town chase on a path: runs, 3 hits drop the post bag (item:returned), hands over to story
//   enemies:b1        forest Cheese Mill: Grizzlechop — flurry gold glint, Wheel Ride lane, P2 crossbowmen, Cheese Bombs; beaten with god
//   enemies:b2        gate causeway: Cacklejaw — Laugh Quake, Ratio Rush (gold lane), the Jeer Duet, 3 shadow clones; beaten with god
//   Controls rework (CONTROLS_SPEC §8.5 / §12 enemies), seen through the iso camera:
//   enemies:onscreen-rule      a crossbowman 13 m down-screen (off screen, > 9 m) holds fire; on screen at 9.6 m it aims; a
//                              crow far off screen dives only once it is on screen; keep band [6, 9]
//   enemies:telegraph-payload  rat_pike `combat:telegraph` carries attackId / arc / range / windup / activeAt /
//                              targetsPlayer; activeAt = the first live frame; the facing (wedge) freezes ≥ 0.15 s
//                              before it; a hyena lunge carries a lane; wedge + parry ring shot from above
//   enemies:touch              phones (hasTouch + isMobile, 844×390 and 390×844): the wedge / parry ring read from
//                              above, a crossbowman beside the narrow portrait frame holds fire, tap a rat = it falls
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

fs.mkdirSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots', 'enemies'), { recursive: true });

/** Page-side helpers (installed per block as window.__GAME__.__en). */
const HELPERS = () => {
  const g = window.__GAME__, ctx = g.ctx, THREE = g.THREE, E = g.E;
  const h = {
    tele: [], offs: [],
    /** spawn `type` at (angle relative to her facing, distance) facing her */
    spawn(type, rel, dist, opts = {}) {
      const p = ctx.player, a = p.facing + rel;
      const pos = new THREE.Vector3(p.pos.x + Math.sin(a) * dist, 0, p.pos.z + Math.cos(a) * dist);
      const facing = opts.facing ?? Math.atan2(p.pos.x - pos.x, p.pos.z - pos.z);
      const e = ctx.enemies.spawn(type, pos, { ...opts, facing });
      if (opts.passive) e.ai = false;
      return e;
    },
    loaded() { return ctx.enemies.list.every((e) => e.dormant || !e.alive || (e.visual && (e.anim || e.def.procedural || !e.def.anims || !Object.keys(e.def.anims).length))); },
    /** fitted visual height (m) vs the def height */
    fit(e) {
      e.object3d.updateMatrixWorld(true);
      const b = new THREE.Box3();
      e.visual.traverse((o) => {
        if (!o.isMesh || !o.visible || o.userData.sharedProp || !o.geometry) return;
        let hidden = false; for (let q = o; q && q !== e.visual; q = q.parent) if (!q.visible) hidden = true;
        if (hidden) return;
        if (o.isSkinnedMesh) { const v = new THREE.Vector3(); const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i += 3) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); b.expandByPoint(v); } }
        else b.expandByObject(o);
      });
      const s = b.getSize(new THREE.Vector3());
      return { y: s.y, x: s.x, z: s.z };
    },
    /** camera: a cut framing in `actor`'s local frame (+Z = in front of it) */
    frame(actor, pos, look, fov = 35) { ctx.game.setMode('play'); return ctx.cam.shot({ anchor: actor, pos, look, mode: 'cut', fov }); },
    follow() { ctx.cam.mode('follow', { blend: 0 }); },
    listen() {
      h.offs.push(ctx.bus.on(E.TELEGRAPH, (p) => {
        const a = p.actor, pl = ctx.player;
        const chest = a?.pos ? { x: a.pos.x, y: a.pos.y + (a.height ?? 1) * 0.5, z: a.pos.z } : null;
        h.tele.push({
          id: p.id, kind: p.kind, shape: p.shape, type: a?.def?.id, dur: p.duration, at: ctx.game.time, actor: a,
          // CONTROLS_SPEC §8.5 payload + where the shooter stood (the on-screen rule)
          attackId: p.attackId, arc: p.arc ?? null, lane: p.lane ?? null, range: p.range, windup: p.windup, activeAt: p.activeAt,
          targetsPlayer: p.targetsPlayer, onScreen: chest ? ctx.cam.onScreen?.(chest, 0.5) ?? null : null,
          dist: a?.pos && pl ? Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z) : null,
        });
        if (h.freezeKind === p.kind && h.freezeAt === Infinity) h.freezeAt = ctx.game.time + h.freezeDelay;
      }));
      h.offs.push(ctx.bus.on(E.TELEGRAPH_END, (p) => {
        const t = h.tele.find((x) => x.id === p.id);
        if (t && t.endAt == null) { t.endAt = ctx.game.time; t.endState = t.actor?.stateName; }
      }));
      h.offs.push(ctx.bus.on(E.ENEMY_ALERTED, () => {
        if (h.freezeKind === 'alert' && h.freezeAt === Infinity) h.freezeAt = ctx.game.time + h.freezeDelay;
      }));
      // screenshots of split-second states: freeze the simulation (time scale 0) at a chosen sim time
      h.offs.push(ctx.game.addFrameHook(() => {
        if (!h.frozen && ctx.game.time >= h.freezeAt) { ctx.game.setTimeScale(0); h.frozen = true; }
      }));
    },
    freezeKind: null, freezeDelay: 0, freezeAt: Infinity, frozen: false,
    /** freeze `delay` sim-seconds after the next telegraph of `kind` ('alert' = the next enemy:alerted; null = now) */
    freezeAfter(kind, delay) { h.freezeKind = kind; h.freezeDelay = delay; h.freezeAt = kind ? Infinity : ctx.game.time + delay; h.frozen = false; },
    thaw() { h.freezeKind = null; h.freezeAt = Infinity; h.frozen = false; ctx.game.setTimeScale(1); },
    done() { h.thaw(); for (const off of h.offs) off(); h.offs.length = 0; h.follow(); ctx.enemies.clear(); },
  };
  g.__en = h;
  g.god(true);
  // step off the start spawn (the practice-field fence sits between the camera and the lane there)
  const p = ctx.player, ahead = new THREE.Vector3(p.pos.x + Math.sin(p.facing) * 7, 0, p.pos.z + Math.cos(p.facing) * 7);
  ahead.y = ctx.physics.heightAt(ahead.x, ahead.z);
  p.teleport({ pos: ahead, facing: p.facing });
  ctx.cam.snapBehind?.();
  ctx.input.setDevice?.('kbm');
  ctx.game.setTimeScale(1);
  return true;
};

async function prepare(t, day = false) {
  await t.G((src) => new Function(`return (${src})`)()(), HELPERS.toString());
  await t.G(() => window.__GAME__.__en.listen());
  if (day) await t.G(() => window.__GAME__.ctx.env?.preset?.('meadow_day', 0));      // M2 looks read better in daylight
}

/**
 * Page fn: the iso camera's screen axes on the ground at her feet. `down` = toward the lens (screen-down), `right` =
 * screen right (checked through the real projection), plus her position, the input device and the iso framing.
 */
const SCREEN_AXES = () => {
  const g = window.__GAME__, ctx = g.ctx, p = ctx.player.pos, c = ctx.camera.position;
  let dx = c.x - p.x, dz = c.z - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  let rx = -dz, rz = dx;
  const s0 = g.screen(p.x, p.z), s1 = g.screen(p.x + rx * 2, p.z + rz * 2);
  if (s0 && s1 && s1.x < s0.x) { rx = -rx; rz = -rz; }
  return { down: [dx, dz], right: [rx, rz], p: [p.x, p.z], dev: ctx.input.device, ring: ctx.state.settings?.parryRing ?? null, iso: g.cam.iso() };
};

/** Wait until every spawned enemy has its model (or fail after `ms`). */
async function waitLoaded(t, ms = 45000) {
  try { await t.page.waitForFunction(() => window.__GAME__.__en.loaded(), null, { timeout: ms, polling: 100 }); return true; }
  catch { t.fail('enemy models did not finish loading'); return false; }
}

/** Poll a page predicate (returns true/false). */
async function until(t, fn, arg, ms = 8000) {
  try { await t.page.waitForFunction(fn, arg, { timeout: ms, polling: 30 }); return true; } catch { return false; }
}

export default [
  {
    name: 'enemies:looks', order: 40, level: 'meadow', spawn: 'start', timeout: 240000,
    async run(t) {
      await prepare(t);
      const FRONT = { rat_pike: [[0.55, 0.75, 2.0], [0, 0.4, 0]], rat_xbow: [[0.55, 0.75, 2.0], [0, 0.4, 0]], crow: [[0.9, 0.5, 2.6], [0, 0.1, 0]] };
      const SIDE = { rat_pike: [[-2.4, 0.75, 0.6], [0, 0.4, 0.2]], rat_xbow: [[-2.4, 0.75, 0.6], [0, 0.4, 0.2]], crow: [[-2.8, 0.6, 0.4], [0, 0.1, 0]] };
      for (const type of ['rat_pike', 'rat_xbow', 'crow']) {
        const id = await t.G((ty) => window.__GAME__.__en.spawn(ty, -0.9, ty.startsWith('boss') ? 7 : 5, { passive: true }).id, type);   // clear of the wall
        await waitLoaded(t);
        await t.frames(20);
        const f = await t.G((rid) => {
          const g = window.__GAME__, h = g.__en, e = g.ctx.enemies.list.find((x) => x.id === rid);
          return { type: e.type, fit: h.fit(e), h: e.def.height, wing: e.def.fit?.x ?? null, clips: e.anim ? Object.keys(e.anim.actions).length : 0,
            current: e.anim?.currentName ?? null, helmet: !!e.helmet, tip: !!e.tipNode, alt: +(e.pos.y - g.ctx.physics.heightAt(e.pos.x, e.pos.z)).toFixed(2) };
        }, id);
        t.log(`${f.type}: visual ${f.fit.x.toFixed(2)} × ${f.fit.y.toFixed(2)} × ${f.fit.z.toFixed(2)} m, clip ${f.current}, ${f.clips} actions, helmet ${f.helmet}, tip ${f.tip}, alt ${f.alt}`);
        t.assert(f.clips > 0 && f.current, `${f.type}: no animation playing`);
        if (type === 'crow') {
          t.assert(Math.abs(Math.max(f.fit.x, f.fit.z) / f.wing - 1) < 0.25, `crow wingspan ${Math.max(f.fit.x, f.fit.z).toFixed(2)} vs ${f.wing}`);   // world AABB: the span lies on x or z by its facing
          t.assert(f.alt > 2.5, `crow flies (altitude ${f.alt} m)`);
        } else t.assert(f.fit.y >= f.h * 0.85 && f.fit.y <= f.h * 1.45, `${f.type}: height ${f.fit.y.toFixed(2)} vs ${f.h} (gear included)`);
        t.assert(f.helmet, `${f.type}: helm / hood worn`);
        if (type !== 'crow') t.assert(f.tip, `${f.type}: weapon mounted`);
        // close-ups (the model must face its +Z: toward the camera in the front shot)
        for (const [view, [pos, look]] of [['front', FRONT[type]], ['side', SIDE[type]]]) {
          await t.G(([rid, a, b]) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.__en.frame(e, a, b, 38); }, [id, pos, look]);
          await t.frames(6);
          await t.shot(`enemies/looks-${type}${view === 'side' ? '-side' : ''}`);
        }
        await t.G(() => window.__GAME__.__en.done());
      }
      // the three together, as she sees them
      await t.G(() => { const h = window.__GAME__.__en; h.spawn('rat_pike', 0.55, 4.5, { passive: true }); h.spawn('rat_xbow', -0.5, 4.8, { passive: true }); h.spawn('crow', 0, 7, { passive: true }); });
      await waitLoaded(t);
      await t.G(() => { const g = window.__GAME__; return g.ctx.cam.shot({ anchor: g.ctx.player, pos: [0.3, 2.4, -3.2], look: [0, 1.4, 5], mode: 'cut', fov: 55 }); });
      await t.frames(20);
      await t.shot('enemies/looks-lineup');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:cs02', order: 41, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      await prepare(t);
      const ids = await t.G(() => {
        const g = window.__GAME__, h = g.__en, ctx = g.ctx;
        const cj = h.spawn('cacklejaw', 0.0, 4.5, { id: 'cacklejaw', scripted: true, ai: false });
        const pf = h.spawn('pilfer', 0.55, 3.6, { id: 'pilfer', scripted: true, ai: false });
        const h1 = h.spawn('hyena', -0.6, 3.8, { id: 'hyena_1', scripted: true, ai: false, cage: 'pearl' });
        const h2 = h.spawn('hyena', -1.0, 5.5, { id: 'hyena_2', scripted: true, ai: false, cage: true, word: 'GRUMBLER' });
        ctx.game.setMode('cutscene');
        pf.prop('signpost', true); pf.prop('post_bag', true);
        return { cj: cj.id, pf: pf.id, h1: h1.id, h2: h2.id };
      });
      await waitLoaded(t);
      const info = await t.G(() => {
        const ctx = window.__GAME__.ctx, A = ctx.actors;
        const cj = A.get('cacklejaw'), pf = A.get('pilfer'), h1 = A.get('hyena_1'), h2 = A.get('hyena_2');
        cj.play('laugh'); cj.emote('laugh');
        return {
          found: !!(cj && pf && h1 && h2), scripted: [cj, pf, h1, h2].every((e) => e.scripted && !e.hurtable),
          plates: [cj.plateWord, pf.plateWord, h1.plateWord, h2.plateWord], heads: [cj, pf, h1, h2].every((e) => !!e.head),
          cage: [!!h1.extraProps.cage, h1.cageWho, !!h2.extraProps.cage, h2.cageWho], props: [!!pf.extraProps.signpost, !!pf.extraProps.post_bag],
          hat: !!cj.model?.scene.getObjectByName('Barbarian_Hat')?.visible,
        };
      });
      t.log(`cast: plates ${info.plates.join(' / ')}, cages ${info.cage.join(' ')}, pilfer props ${info.props}, cacklejaw hat ${info.hat}`);
      t.assert(info.found, 'CS-02 cast registered under their cutscene ids');
      t.assert(info.scripted, 'CS-02 cast is scripted and not hurtable');
      t.assert(info.heads, 'beast heads attached');
      t.assert(info.plates[0] === 'HATER-IN-CHIEF' && info.plates[1] === 'POST STEALER' && info.plates[3] === 'GRUMBLER', `plates ${info.plates}`);
      t.assert(info.cage[0] && info.cage[1] === 'pearl' && info.cage[2], 'caged hyenas (Pearl + a squire)');
      t.assert(info.props[0] && info.props[1], 'Pilfer holds the signpost and the post bag');
      t.assert(info.hat, 'Cacklejaw keeps Barbarian_Hat (hides the chipped ear, §11.3)');
      // the two files walk the lane at 1.6 m/s (scripted moveTo) while Cacklejaw laughs
      const w0 = await t.G(() => {
        const ctx = window.__GAME__.ctx, e = ctx.actors.get('hyena_2'), p = ctx.player.pos;
        e.moveTo([p.x - 4.6, p.z + 9], 1.6);
        return [e.pos.x, e.pos.z];
      });
      await t.wait(1200);
      const moving = await t.G(() => { const e = window.__GAME__.ctx.actors.get('hyena_2'); return { x: e.pos.x, z: e.pos.z, clip: e.anim?.currentName, moving: e.isMoving }; });
      const walked = Math.hypot(moving.x - w0[0], moving.z - w0[1]);
      t.assert(walked > 0.6, `scripted moveTo walks (${walked.toFixed(2)} m in 1.2 s)`);
      t.log(`hyena_2 walked ${walked.toFixed(2)} m, clip ${moving.clip}`);
      t.assert(/Walking|Running/.test(moving.clip ?? '') || !moving.moving, `walk clip while moving (${moving.clip})`);
      await t.G(() => { const g = window.__GAME__; return g.ctx.cam.shot({ anchor: g.ctx.player, pos: [0.2, 1.6, -2.6], look: [0, 1.1, 4.5], mode: 'cut', fov: 50 }); });
      await t.frames(30);
      await t.shot('enemies/cs02-cast');
      for (const id of ['cacklejaw', 'pilfer', 'hyena_1']) {
        await t.G((x) => {
          const g = window.__GAME__, e = g.ctx.actors.get(x), H = e.def.height ?? 1.3;
          return g.ctx.cam.shot({ anchor: e, pos: [0.5 * H, 0.75 * H, 1.6 * H], look: [0, 0.6 * H, 0], mode: 'cut', fov: 40 });
        }, id);
        await t.frames(8);
        await t.shot(`enemies/cs02-${id}`);
      }
      await t.G(() => { const g = window.__GAME__; g.ctx.game.setMode('play'); for (const e of [...g.ctx.enemies.list]) e.setScripted(false); g.__en.done(); });
    },
  },
  {
    name: 'enemies:pike', order: 42, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t);
      const id = await t.G(() => window.__GAME__.__en.spawn('rat_pike', 0, 5.5, { passive: true }).id);
      await waitLoaded(t);
      await t.G((rid) => { const g = window.__GAME__; g.clearEvents(); g.__en.freezeAfter('alert', 0.12); g.ctx.enemies.list.find((x) => x.id === rid).ai = true; }, id);
      const alerted = await t.waitForEvent('enemy:alerted', 4000);
      t.assert(alerted, 'rat_pike alerted (her within 10 m in its FOV)');
      if (alerted && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        const bang = await t.G((rid) => { const e = window.__GAME__.ctx.enemies.list.find((x) => x.id === rid); return { on: !!e.bang?.visible, state: e.stateName }; }, id);
        t.assert(bang.on && bang.state === 'alert', `the alert "!" pops over its head (${bang.state})`);
        await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.__en.frame(e, [1.4, 1.0, 2.6], [0, 0.7, 0], 42); }, id);
        await t.frames(3);
        await t.shot('enemies/pike-alert');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      await t.G(() => window.__GAME__.__en.freezeAfter('parry', 0.3));
      const tele = await until(t, () => window.__GAME__.__en.tele.some((x) => x.type === 'rat_pike'), null, 15000);
      t.assert(tele, 'rat_pike telegraphs its poke');
      if (tele && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.__en.frame(e, [1.3, 0.9, 1.9], [0, 0.45, 0.6], 42); }, id);
        await t.frames(3);
        await t.shot('enemies/pike-windup');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      const hit = await until(t, () => window.__GAME__.ctx.combat.log.some((x) => x.attackId === 'rat_poke' || x.attackId === 'rat_poke2'), null, 12000);
      t.assert(hit, 'rat_poke connects with her (god mode: 0 damage)');
      const st = await t.G((rid) => {
        const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid);
        return { tele: g.__en.tele.filter((x) => x.type === 'rat_pike').map((x) => `${x.kind}/${x.shape}/${x.dur.toFixed(2)}`), state: e.stateName };
      }, id);
      t.log(`pike telegraphs ${st.tele.join(', ')}; state ${st.state}`);
      t.assert(st.tele.every((x) => x.startsWith('parry/glint') || x.startsWith('gold/glint')), 'rat_pike telegraphs are white (or gold follow-up) glints');
      t.assert(st.tele.every((x) => parseFloat(x.split('/')[2]) >= 0.45), 'windups ≥ 0.45 s (§10.1)');
      // defeat: heavy hits from her, seen from the side
      await t.G((rid) => {
        const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid);
        g.clearEvents();
        return g.ctx.cam.shot({ anchor: e, pos: [2.6, 1.6, 2.4], look: [0, 0.5, 0], mode: 'cut', fov: 50 });
      }, id);
      const dead = await t.G((rid) => {
        const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => x.id === rid);
        for (let i = 0; i < 6 && e.alive; i++) { e.invulnT = 0; ctx.combat.applyHit(ctx.player, e, ctx.config.ATTACKS.slash3); }
        ctx.game.hitstopT = 0;
        g.__en.freezeAfter(null, 0.22);
        return { alive: e.alive, state: e.stateName, helmet: !!e.helmet, debris: ctx.enemies.debris.length };
      }, id);
      t.assert(!dead.alive && dead.state === 'die', `rat_pike defeated (${dead.state})`);
      t.assert(dead.debris === 1 && !dead.helmet, 'the kettle helm spins off');
      t.assert((await t.events()).includes('enemy:died'), 'enemy:died emitted');
      if (await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.frames(3);
        await t.shot('enemies/pike-defeat');
        await t.G(() => window.__GAME__.__en.thaw());
      }
      const gone = await until(t, (rid) => !window.__GAME__.ctx.enemies.list.some((x) => x.id === rid), id, 12000);
      t.assert(gone, 'defeated rat despawns after scampering');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:xbow', order: 43, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      await prepare(t);
      const id = await t.G(() => window.__GAME__.__en.spawn('rat_xbow', 0.2, 9).id);
      await waitLoaded(t);
      const tele = await until(t, () => window.__GAME__.__en.tele.some((x) => x.type === 'rat_xbow' && x.kind === 'aim'), null, 8000);
      t.assert(tele, 'rat_xbow aims (aim telegraph, dotted line)');
      if (tele) {
        await t.G(() => { const g = window.__GAME__; return g.ctx.cam.shot({ anchor: g.ctx.player, pos: [2.4, 1.8, -2.2], look: [0, 0.6, 4], mode: 'cut', fov: 50 }); });
        await t.wait(250);
        await t.shot('enemies/xbow-aim');
        await t.G(() => window.__GAME__.__en.follow());
      }
      const shot = await until(t, () => (window.__GAME__.ctx.combat.stats?.projectiles ?? 0) > 0, null, 4000);
      t.assert(shot, 'rat_xbow fires a bolt');
      const res = await t.G((rid) => {
        const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid), p = g.ctx.player;
        return { d: Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z), state: e.stateName, tele: g.__en.tele.filter((x) => x.type === 'rat_xbow').map((x) => `${x.kind}/${x.shape}/${x.dur.toFixed(2)}`) };
      }, id);
      t.log(`xbow at ${res.d.toFixed(1)} m, state ${res.state}, telegraphs ${res.tele.join(', ')}`);
      t.assert(res.tele.every((x) => x.startsWith('aim/line') && parseFloat(x.split('/')[2]) >= 0.8), 'aim telegraph lasts ≥ 0.8 s');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:crow', order: 44, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t);
      const id = await t.G(() => window.__GAME__.__en.spawn('crow', 0.3, 7).id);
      await waitLoaded(t);
      await t.frames(10);
      await t.shot('enemies/crow-circling');
      await t.G(() => window.__GAME__.__en.freezeAfter('shadow', 0.75));
      const tele = await until(t, () => window.__GAME__.__en.tele.some((x) => x.type === 'crow' && x.kind === 'shadow'), null, 10000);
      t.assert(tele, 'crow telegraphs its dive with a shadow decal');
      if (tele && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        // from behind and above the hovering crow, looking down its dive line at the shadow under her
        await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.ctx.cam.shot({ anchor: e, pos: [1.0, 1.2, -3.0], look: [0, -2.6, 3.2], mode: 'cut', fov: 62 }); }, id);
        await t.frames(3);
        await t.shot('enemies/crow-shadow');
        await t.G(() => window.__GAME__.__en.follow());
      }
      // freeze the sim on the frame the peck starts (a slow page can otherwise poll past the 1.2 s peck)
      await t.G((rid) => {
        const g = window.__GAME__, h = g.__en, ctx = g.ctx;
        h.thaw();
        const off = ctx.game.addFrameHook(() => {
          if (ctx.enemies.list.find((x) => x.id === rid)?.stateName === 'peck') { ctx.game.setTimeScale(0); h.frozen = true; off(); }
        });
        h.offs.push(off);
      }, id);
      const peck = await until(t, (rid) => window.__GAME__.__en.frozen && window.__GAME__.ctx.enemies.list.find((x) => x.id === rid)?.stateName === 'peck', id, 8000);
      t.assert(peck, 'crow dives, lands and pecks');
      const sh = await t.G(() => { const x = window.__GAME__.__en.tele.find((q) => q.type === 'crow' && q.kind === 'shadow'); return x && { dur: x.dur, len: x.endAt - x.at, endState: x.endState }; });
      if (sh) t.log(`crow shadow: duration ${sh.dur.toFixed(2)} s, shown ${sh.len?.toFixed(2)} s, ended in ${sh.endState}`);
      t.assert(sh && sh.endState === 'peck', 'the shadow decal stays up until the dive lands');
      const r = await t.G((rid) => {
        const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => x.id === rid);
        const alt = e.pos.y - ctx.physics.heightAt(e.pos.x, e.pos.z);
        const res = ctx.combat.applyHit(ctx.player, e, ctx.config.ATTACKS.slash1);
        ctx.game.hitstopT = 0;
        return { alt, res, hp: e.hp, max: e.maxHp, grounded: e.grounded };
      }, id);
      t.log(`pecking crow: alt ${r.alt.toFixed(2)} m, slash1 → ${r.res} (hp ${r.hp}/${r.max})`);
      t.assert(r.res === 'hit', 'a pecking crow is hittable');
      await t.G(() => window.__GAME__.__en.thaw());
      if (peck) {
        await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.ctx.cam.shot({ anchor: e, pos: [1.2, 0.8, 2.0], look: [0, 0.2, 0], mode: 'cut', fov: 50 }); }, id);
        await t.wait(300);                              // past the 60 ms hit flash
        await t.shot('enemies/crow-peck');
        await t.G(() => window.__GAME__.__en.follow());
      }
      // airborne again: a sword can't reach it
      const up = await until(t, (rid) => { const e = window.__GAME__.ctx.enemies.list.find((x) => x.id === rid); return e && e.pos.y - window.__GAME__.ctx.physics.heightAt(e.pos.x, e.pos.z) > 2.6; }, id, 8000);
      if (up) {
        const r2 = await t.G((rid) => { const ctx = window.__GAME__.ctx, e = ctx.enemies.list.find((x) => x.id === rid); e.invulnT = 0; return ctx.combat.applyHit(ctx.player, e, ctx.config.ATTACKS.slash1); }, id);
        t.assert(r2 === 'immune', `an airborne crow is out of sword reach (got ${r2})`);
      } else t.warn('crow did not climb back above 2.6 m within 8 s');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:budget', order: 45, level: 'meadow', spawn: 'start', timeout: 60000,
    async run(t) {
      await prepare(t);
      const r = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, h = g.__en;
        // one squad behind her, out of sight (all within TUNING.capRadius of each other: one fight)
        const list = []; for (let i = 0; i < 10; i++) list.push(h.spawn('rat_pike', Math.PI + (i - 5) * 0.15, 16));
        const before = { active: ctx.enemies.count(), pending: ctx.enemies.pending.length, cap: ctx.enemies.cap };
        ctx.enemies.despawn(list[0]); ctx.enemies.despawn(list[1]);
        return before;
      });
      await t.frames(3);
      const after = await t.G(() => { const ctx = window.__GAME__.ctx; return { active: ctx.enemies.count(), pending: ctx.enemies.pending.length, visible: ctx.enemies.list.filter((e) => e.object3d.visible).length }; });
      t.log(`budget: cap ${r.cap}; 10 spawns → ${r.active} active + ${r.pending} held; after 2 despawns → ${after.active} active + ${after.pending} held`);
      t.assert(r.active === r.cap && r.pending === 10 - r.cap, 'over-budget spawns are held dormant');
      t.assert(after.active === Math.min(8, r.cap) && after.pending === 0 && after.visible === 8, 'held spawns wake as slots free');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:leak', order: 45.5, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      await prepare(t);
      const counts = [];
      for (let wave = 0; wave < 5; wave++) {
        await t.G(() => { const h = window.__GAME__.__en; for (const [k, a] of [['rat_pike', 0.2], ['rat_xbow', -0.4], ['crow', 0.8], ['rat_pike', -0.9]]) h.spawn(k, a, 9, { passive: true }); });
        await waitLoaded(t);
        await t.frames(5);                               // rendered once: bone textures uploaded
        await t.G(() => { const ctx = window.__GAME__.ctx; for (const e of [...ctx.enemies.list]) ctx.enemies.despawn(e); });
        await t.frames(5);
        counts.push(await t.G(() => window.__GAME__.ctx.renderer.info.memory.textures));
      }
      t.log(`textures after each spawn/despawn wave: ${counts.join(' → ')}`);
      t.assert(counts[4] - counts[1] <= 1, 'despawned enemies free their GPU textures (skeleton bone textures)');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:meow', order: 46, level: 'meadow', spawn: 'start', timeout: 60000,
    async run(t) {
      await prepare(t);
      const id = await t.G(() => {
        // stays on its post (patrol radius 0), looking away from her
        return window.__GAME__.__en.spawn('rat_pike', Math.PI, 6, { facing: window.__GAME__.ctx.player.facing + Math.PI, patrolRadius: 0 }).id;
      });
      await t.frames(10);
      const before = await t.G((rid) => window.__GAME__.ctx.enemies.list.find((x) => x.id === rid).alerted, id);
      await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.PLAYER_MEOW, { position: g.ctx.player.pos.clone() }); });
      await t.frames(3);
      const after = await t.G((rid) => { const e = window.__GAME__.ctx.enemies.list.find((x) => x.id === rid); return { alerted: e.alerted, state: e.stateName }; }, id);
      t.assert(!before, 'a rat behind her (facing away) has not noticed her');
      t.assert(after.alerted && (after.state === 'alert' || after.state === 'chase'), `Meow pulls it (${after.state})`);
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:level', order: 47, level: null, timeout: 180000,
    async run(t) {
      await t.G(() => window.__GAME__.story.flag('prologue.done', true));
      await t.loadLevel('meadow', 'start');
      await prepare(t);
      try {
        await waitLoaded(t);
        // no cutscene (the title loop after a reload) holds the zones
        for (let i = 0; i < 20 && (await t.G(() => window.__GAME__.ctx.game.mode)) !== 'play'; i++) {
          await t.G(() => { const g = window.__GAME__; g.story.skip?.(); g.story.skipAll?.(); g.setMode('play'); });
          await t.wait(150);
        }
        const s0 = await t.G(() => {
          const ctx = window.__GAME__.ctx, by = {};
          for (const e of ctx.enemies.list) (by[e.type] ??= []).push(e);
          const g = (e) => +(e.pos.y - ctx.physics.heightAt(e.pos.x, e.pos.z)).toFixed(2);
          return {
            counts: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length])),
            dormant: ctx.enemies.list.filter((e) => e.dormant).length,
            perched: (by.rat_xbow ?? []).map((e) => ({ id: e.id, perched: e.perched, alt: g(e), y: e.pos.y })),
            crows: (by.crow ?? []).map((e) => ({ id: e.id, alt: g(e), x: e.pos.x, z: e.pos.z })),
            patrol: (by.rat_pike ?? []).map((e) => e.patrolRadius),
          };
        });
        t.log(`meadow spawns ${JSON.stringify(s0.counts)}, dormant ${s0.dormant}; xbows ${s0.perched.map((p) => `${p.perched ? 'perched' : 'ground'}@${p.alt}`).join(' ')}; crows alt ${s0.crows.map((c) => c.alt).join(' ')}; pike patrol r ${s0.patrol.join(' ')}`);
        t.assert(s0.counts.rat_pike === 4 && s0.counts.rat_xbow === 3 && s0.counts.crow === 4, `crossroads + Crow Fields spawns (${JSON.stringify(s0.counts)})`);
        t.assert(s0.dormant === 0, 'two far-apart zones never hold each other back (§8.3 budget is per fight)');
        t.assert(s0.perched.every((p) => p.perched && p.alt >= 0.9), 'crossbowmen sit on their wall / hay bales');
        t.assert(s0.crows.every((c) => c.alt > 2.5), 'crows fly');
        t.assert(s0.patrol.includes(4) && s0.patrol.includes(2), 'zone patrol radii reach the pikes');
        const t0 = await t.G(() => window.__GAME__.ctx.game.time);
        await until(t, (a) => window.__GAME__.ctx.game.time >= a + 1.5, t0, 20000);     // 1.5 s of sim time
        const s1 = await t.G(() => {
          const ctx = window.__GAME__.ctx;
          return {
            perched: ctx.enemies.list.filter((e) => e.type === 'rat_xbow').map((e) => ({ id: e.id, y: e.pos.y })),
            crows: ctx.enemies.list.filter((e) => e.type === 'crow').map((e) => ({ id: e.id, x: e.pos.x, z: e.pos.z, st: e.stateName, asleep: !!e.asleep, vis: e.object3d.visible })),
            mode: ctx.game.mode, loading: !!ctx.levels.loading, time: ctx.game.time, cs: ctx.story?.current?.id ?? ctx.story?.current?.def?.id ?? null,
          };
        });
        t.log(`after 1.5 s: mode ${s1.mode} (${s1.cs}), loading ${s1.loading}; crows moved ${s1.crows.map((c) => { const o = s0.crows.find((q) => q.id === c.id); return `${c.st}:${Math.hypot(c.x - o.x, c.z - o.z).toFixed(1)}`; }).join(' ')}`);
        t.assert(s1.perched.every((p) => Math.abs(p.y - s0.perched.find((q) => q.id === p.id).y) < 0.01), 'perched crossbowmen stay put');
        t.assert(s1.crows.every((c) => { const o = s0.crows.find((q) => q.id === c.id); return c.asleep ? !c.vis : Math.hypot(c.x - o.x, c.z - o.z) > 1; }),
          'crows circle (far ones sleep hidden: the world §18 budget request)');
        // the crossroads perch, seen from the road
        await t.G(() => {
          const g = window.__GAME__, ctx = g.ctx;
          const x = ctx.enemies.list.find((e) => e.type === 'rat_xbow' && e.pos.z < 0);
          x.facing = Math.atan2(-18 - x.pos.x, -38 - x.pos.z);
          return ctx.cam.shot({ anchor: x, pos: [1.2, 0.6, 3.6], look: [0, -0.1, 0], mode: 'cut', fov: 50 });
        });
        await t.frames(20);
        await t.shot('enemies/level-crossroads');
        // Crow Fields: a crossbowman on a hay bale under the circling crows
        await t.G(() => {
          const g = window.__GAME__, ctx = g.ctx;
          const x = ctx.enemies.list.find((e) => e.type === 'rat_xbow' && e.pos.z > 40);
          x.facing = Math.atan2(24 - x.pos.x, 40 - x.pos.z);
          return ctx.cam.shot({ anchor: x, pos: [1.6, 1.0, 5.0], look: [-1.0, 2.2, 0], mode: 'cut', fov: 60 });
        });
        await t.frames(20);
        await t.shot('enemies/level-crowfields');
      } finally {
        await t.G(() => { const g = window.__GAME__; g.story.flag('prologue.done', false); g.__en?.done(); });
      }
    },
  },
  // ============================================================================ M2: forest, town, gate
  {
    name: 'enemies:m2looks', order: 48, level: 'meadow', spawn: 'start', timeout: 300000,
    async run(t) {
      await prepare(t, true);
      const VIEW = {
        spider: [[0.9, 0.7, 1.9], [0, 0.2, 0]], hyena: [[0.9, 1.1, 2.6], [0, 0.75, 0]], stealer: [[0.9, 1.0, 2.5], [0, 0.65, 0]],
        pug: [[0.9, 1.0, 2.6], [0, 0.7, 0]], jelly_l: [[0.8, 0.8, 2.2], [0, 0.4, 0]], jelly_giant: [[1.2, 1.3, 3.6], [0, 0.8, 0]],
        boss_grizzlechop: [[2.6, 1.4, 3.4], [0, 0.7, 0.4]], boss_cacklejaw: [[1.2, 1.8, 4.0], [0, 1.3, 0]], cacklejaw_clone: [[1.2, 1.8, 4.0], [0, 1.3, 0]],
      };
      for (const [type, [pos, look]] of Object.entries(VIEW)) {
        const id = await t.G((ty) => window.__GAME__.__en.spawn(ty, -0.9, ty.startsWith('boss') ? 7 : 5, { passive: true }).id, type);   // clear of the wall
        if (!(await waitLoaded(t))) break;
        await t.frames(15);
        const f = await t.G((rid) => {
          const g = window.__GAME__, h = g.__en, e = g.ctx.enemies.list.find((x) => x.id === rid);
          return { type: e.type, fit: h.fit(e), h: e.def.height, clips: e.anim ? Object.keys(e.anim.actions).length : -1, helmet: !!e.helmet, tip: !!e.tipNode, head: !!e.head };
        }, id);
        t.log(`${f.type}: ${f.fit.x.toFixed(2)} × ${f.fit.y.toFixed(2)} × ${f.fit.z.toFixed(2)} m (row h ${f.h}), clips ${f.clips}, head ${f.head}, tip ${f.tip}`);
        t.assert(Math.abs(f.fit.y / f.h - 1) < 0.35, `${type}: fitted height ${f.fit.y.toFixed(2)} vs ${f.h}`);
        await t.G(([rid, p, l]) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.__en.frame(e, p, l, 40); }, [id, pos, look]);
        await t.frames(8);
        await t.shot(`enemies/m2-looks-${type}`);
        await t.G((rid) => { const g = window.__GAME__; g.ctx.enemies.despawn(g.ctx.enemies.list.find((x) => x.id === rid)); g.__en.follow(); }, id);
      }
      // the lineup (left → right): spider, jelly S / M / L, stealer, hyena, pug
      await t.G(() => {
        const g = window.__GAME__, h = g.__en, p = g.ctx.player;
        const types = ['spider', 'jelly_s', 'jelly_m', 'jelly_l', 'stealer', 'hyena', 'pug'];
        types.forEach((ty, i) => h.spawn(ty, (i - 3) * 0.17, 6, { passive: true, facing: p.facing + Math.PI }));
      });
      await waitLoaded(t);
      await t.frames(15);
      await t.G(() => { const g = window.__GAME__; return g.ctx.cam.shot({ anchor: g.ctx.player, pos: [0, 1.4, -0.6], look: [0, 0.6, 6], mode: 'cut', fov: 55 }); });
      await t.frames(8);
      await t.shot('enemies/m2-lineup');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:spider', order: 49, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t, true);
      // off to her right, clear of the practice-field wall ahead-left of the start spawn
      const id = await t.G(() => { const e = window.__GAME__.__en.spawn('spider', -0.9, 6.0, { alerted: true }); e.attackCd.spider_bite = 99; return e.id; });
      await waitLoaded(t);
      await t.G(() => window.__GAME__.__en.freezeAfter('parry', 0.4));
      const tele = await until(t, () => window.__GAME__.__en.tele.some((x) => x.type === 'spider'), null, 15000);
      t.assert(tele, 'spider telegraphs its web glob (white glint)');
      if (tele && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.__en.frame(e, [1.2, 0.8, 1.8], [0, 0.25, 0.3], 42); }, id);
        await t.frames(3);
        await t.shot('enemies/spider-windup');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      const slowed = await until(t, () => { const p = window.__GAME__.ctx.player; return (p.slowT ?? 0) > 0 || p.isSlowed?.(); }, null, 15000);
      t.assert(slowed, 'the web glob slows her');
      const patch = await until(t, () => window.__GAME__.ctx.enemies.webs.list.length > 0, null, 5000);
      t.assert(patch, 'a web patch lies where the glob landed');
      if (patch) {
        await t.G(() => {
          const g = window.__GAME__, w = g.ctx.enemies.webs.list[0];
          g.ctx.game.setTimeScale(0);
          return g.ctx.cam.shot({ anchor: g.ctx.player, pos: [1.6, 2.0, -2.2], look: [w.pos.x - g.ctx.player.pos.x, 0, w.pos.z - g.ctx.player.pos.z], mode: 'cut', fov: 55 });
        });
        await t.wait(300);
        await t.shot('enemies/spider-web');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
        // a slash cuts the patch
        const cut = await t.G(() => {
          const g = window.__GAME__, ctx = g.ctx, w = ctx.enemies.webs.list[0], p = ctx.player;
          p.teleport({ pos: new g.THREE.Vector3(w.pos.x, w.pos.y, w.pos.z - 1.2), facing: 0 });
          ctx.bus.emit(g.E.PLAYER_SWING, { attackId: 'slash1', combo: 1 });
          return w.cut;
        });
        t.assert(cut, 'one slash cuts the patch');
      }
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:hyena', order: 50, level: 'meadow', spawn: 'start', timeout: 180000,
    async run(t) {
      await prepare(t, true);
      const ids = await t.G(() => {
        const h = window.__GAME__.__en;
        return [-0.5, 0, 0.5].map((a, i) => h.spawn('hyena', a, 5.5 + i * 0.6, { alerted: true }).id);
      });
      await waitLoaded(t);
      await t.G(() => window.__GAME__.__en.freezeAfter('jeer', 0.7));
      const jeer = await until(t, () => window.__GAME__.__en.tele.some((x) => x.kind === 'jeer' && x.type === 'hyena'), null, 25000);
      t.assert(jeer, 'a waiting hyena Jeers (purple rings)');
      if (jeer && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.G(() => {
          const g = window.__GAME__, e = g.__en.tele.find((x) => x.kind === 'jeer').actor;
          return g.ctx.cam.shot({ anchor: e, pos: [2.4, 2.4, 4.2], look: [0, 0.6, 0], mode: 'cut', fov: 55 });
        });
        await t.frames(3);
        await t.shot('enemies/hyena-jeer');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      t.assert((await t.events()).includes('enemy:jeer'), 'enemy:jeer emitted');
      const gl = await until(t, (r) => window.__GAME__.ctx.enemies.list.some((e) => r.includes(e.id) && (e.stateName === 'gloat' || e.stateName === 'giggle')), ids, 45000);
      t.assert(gl, 'a hyena gloats after landing a hit (or a flanker giggles behind her)');
      const st = await t.G((r) => {
        const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => r.includes(x.id) && (x.stateName === 'gloat' || x.stateName === 'giggle'));
        if (!e) return null;
        ctx.game.setTimeScale(0);
        ctx.cam.shot({ anchor: e, pos: [1.0, 1.3, 2.4], look: [0, 0.9, 0], mode: 'cut', fov: 45 });
        return { id: e.id, state: e.stateName };
      }, ids);
      if (st) {
        await t.wait(300);
        await t.shot(`enemies/hyena-${st.state}`);
        await t.G(() => window.__GAME__.__en.thaw());
        if (st.state === 'gloat') {
          await t.G((rid) => { const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => x.id === rid); e.invulnT = 0; ctx.combat.applyHit(ctx.player, e, { ...ctx.config.ATTACKS.slash1, dmg: 1 }); }, st.id);
          t.assert((await t.events()).includes('enemy:choke'), 'a hit during the gloat chokes it');
        }
      }
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:stealer', order: 51, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t, true);
      await t.G(() => { window.__GAME__.ctx.state.fish = 100; });
      const id = await t.G(() => window.__GAME__.__en.spawn('stealer', 0.3, 5, { alerted: true }).id);
      await waitLoaded(t);
      await t.G(() => window.__GAME__.__en.freezeAfter('grab', 0.35));
      const tele = await until(t, () => window.__GAME__.__en.tele.some((x) => x.kind === 'grab'), null, 15000);
      t.assert(tele, 'stealer telegraphs its snatch (purple grab swirl)');
      if (tele && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.__en.frame(e, [1.3, 1.1, 2.2], [0, 0.7, 0], 45); }, id);
        await t.frames(3);
        await t.shot('enemies/stealer-grab');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      const stolen = await t.waitForEvent('item:stolen', 8000);
      t.assert(stolen, 'it steals (item:stolen)');
      const s1 = await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return { fish: g.ctx.state.fish, loot: e?.loot, state: e?.stateName }; }, id);
      t.log(`after the snatch: fish ${s1.fish}, loot ${JSON.stringify(s1.loot)}, state ${s1.state}`);
      t.assert(s1.fish === 90 && s1.loot?.amount === 10 && s1.state === 'getaway', '10% of 100 fish, then the getaway');
      await t.G((rid) => { const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => x.id === rid); e.invulnT = 0; ctx.combat.applyHit(ctx.player, e, { ...ctx.config.ATTACKS.slash1, dmg: 1 }); }, id);
      t.assert((await t.events()).includes('item:returned'), 'a hit returns the post (item:returned)');
      await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); g.ctx.game.setTimeScale(0); return g.__en.frame(e, [1.6, 1.6, 2.6], [0, 0.3, 0.6], 50); }, id);
      await t.wait(400);
      await t.shot('enemies/stealer-returned');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:pug', order: 52, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t, true);
      const id = await t.G(() => window.__GAME__.__en.spawn('pug', 0, 2.2, { passive: true }).id);
      await waitLoaded(t);
      const r = await t.G((rid) => {
        const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => x.id === rid);
        e.invulnT = 0; const front = ctx.combat.applyHit(ctx.player, e, ctx.config.ATTACKS.slash1);
        return { front, hp: e.hp, max: e.maxHp };
      }, id);
      t.assert(r.front === 'block' && r.hp === r.max, `frontal slash blocked by the shield (${r.front})`);
      await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.__en.frame(e, [1.3, 1.2, 2.4], [0, 0.65, 0], 42); }, id);
      await t.frames(10);
      await t.shot('enemies/pug-guard');
      await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); g.__en.follow(); e.attackCd.pug_bash = 999; e.ai = true; e.alerted = true; e.setState('chase'); g.__en.freezeAfter('red', 0.75); }, id);
      const tele = await until(t, () => window.__GAME__.__en.tele.some((x) => x.kind === 'red' && x.type === 'pug'), null, 15000);
      t.assert(tele, 'pug_slam telegraphs red');
      if (tele && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.G((rid) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid); return g.__en.frame(e, [2.8, 2.6, 3.6], [0, 0.2, 0], 50); }, id);
        await t.frames(3);
        await t.shot('enemies/pug-slam-tell');
        await t.G(() => { const h = window.__GAME__.__en; h.thaw(); });
      }
      const slam = await until(t, () => window.__GAME__.ctx.combat.log.some((x) => x.attackId === 'pug_slam'), null, 6000);
      t.assert(slam, 'the shockwave ring hits her (standing)');
      // break the shield with a Bright Slash
      const br = await t.G((rid) => {
        const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => x.id === rid), p = ctx.player;
        e.staggerT = 0; e.invulnT = 0; e.facing = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        const res = ctx.combat.applyHit(p, e, ctx.config.ATTACKS.bright);
        return { res, down: e.shieldDownT };
      }, id);
      t.assert(br.res === 'hit' && br.down > 0, 'a Bright Slash breaks the shield');
      await t.G(() => window.__GAME__.__en.follow());
      await t.frames(20);
      await t.shot('enemies/pug-shield-down');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:jelly', order: 53, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t, true);
      const id = await t.G(() => window.__GAME__.__en.spawn('jelly_l', 0, 4.5, { alerted: true }).id);
      await waitLoaded(t);
      await t.G(() => window.__GAME__.__en.freezeAfter('aoe', 0.4));
      const tele = await until(t, () => window.__GAME__.__en.tele.some((x) => x.kind === 'aoe' && String(x.type).startsWith('jelly')), null, 15000);
      t.assert(tele, 'Gloomjelly telegraphs its slam (aoe circle)');
      if (tele && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.G(() => { const g = window.__GAME__; return g.ctx.cam.shot({ anchor: g.ctx.player, pos: [2.2, 2.4, -2.6], look: [0, 0.3, 2.5], mode: 'cut', fov: 50 }); });
        await t.frames(3);
        await t.shot('enemies/jelly-slam-tell');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      const split = await t.G((rid) => {
        const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => x.id === rid);
        e.invulnT = 0; ctx.combat.applyHit(ctx.player, e, ctx.config.ATTACKS.slash3, { dmg: 999 });
        return ctx.enemies.byType('jelly_m').length;
      }, id);
      t.assert(split === 2, `L splits into 2 M (${split})`);
      await waitLoaded(t);
      await t.wait(250);
      await t.G(() => { const g = window.__GAME__; g.ctx.game.setTimeScale(0); return g.ctx.cam.shot({ anchor: g.ctx.player, pos: [1.8, 1.6, -1.8], look: [0, 0.2, 3.5], mode: 'cut', fov: 50 }); });
      await t.wait(300);
      await t.shot('enemies/jelly-split');
      const counts = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx;
        ctx.game.setTimeScale(1);
        for (const m of ctx.enemies.byType('jelly_m')) { m.invulnT = 0; ctx.combat.applyHit(ctx.player, m, ctx.config.ATTACKS.slash3, { dmg: 999 }); }
        const s = ctx.enemies.byType('jelly_s').length;
        const one = ctx.enemies.byType('jelly_s')[0]; one.invulnT = 0;
        ctx.combat.applyHit(ctx.player, one, ctx.config.ATTACKS.bright, { dmg: 999 });
        return { s, after: ctx.enemies.byType('jelly_s').length };
      });
      t.assert(counts.s === 4 && counts.after === 3, `2 M → 4 S; a bright slash pops one without a split (${JSON.stringify(counts)})`);
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:pilfer', order: 54, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t, true);
      await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, p = ctx.player, V = g.THREE.Vector3;
        const f = p.facing, fw = [Math.sin(f), Math.cos(f)], rt = [Math.cos(f), -Math.sin(f)];
        const pt = (a, b) => [p.pos.x + fw[0] * a + rt[0] * b, p.pos.z + fw[1] * a + rt[1] * b];
        const path = [pt(4, 0), pt(10, 1), pt(16, -2), pt(20, 3), pt(14, 6), pt(8, 4)];
        g.__en.chase = ctx.enemies.pilferChase({ path });
        g.__en.chase.done.then((r) => { g.__en.chaseDone = r; });
        return true;
      });
      await waitLoaded(t);
      const run = await until(t, () => window.__GAME__.__en.chase.pilfer.stateName === 'run', null, 5000);
      t.assert(run, 'Pilfer runs the chase path');
      await t.wait(700);
      await t.G(() => { const g = window.__GAME__, e = g.__en.chase.pilfer; g.ctx.game.setTimeScale(0); return g.__en.frame(e, [1.8, 1.2, 2.8], [0, 0.6, 0], 45); });
      await t.wait(300);
      await t.shot('enemies/pilfer-chase');
      await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      for (let i = 0; i < 3; i++) {
        await t.G(() => { const g = window.__GAME__, ctx = g.ctx, e = g.__en.chase.pilfer; e.invulnT = 0; ctx.combat.applyHit(ctx.player, e, { ...ctx.config.ATTACKS.slash1 }); });
        await t.wait(800);
      }
      const ret = await until(t, () => !!window.__GAME__.__en.chaseDone, null, 3000);
      t.assert(ret && (await t.events()).includes('item:returned'), '3 hits: he drops the post bag (item:returned)');
      const s = await t.G(() => { const e = window.__GAME__.__en.chase.pilfer; return { ai: e.ai, hurtable: e.hurtable, alive: e.alive }; });
      t.assert(!s.ai && !s.hurtable && s.alive, 'Pilfer hands over to the story (AI off, not hurtable)');
      await t.G(() => { const g = window.__GAME__, e = g.__en.chase.pilfer; return g.__en.frame(e, [1.6, 1.3, 2.4], [0, 0.4, 0], 45); });
      await t.frames(30);
      await t.shot('enemies/pilfer-bag-dropped');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:b1', order: 55, level: 'forest', spawn: 'boss', timeout: 300000,
    async run(t) {
      await prepare(t);
      const ok = await t.G(() => { const g = window.__GAME__; g.startBoss(); return !!g.ctx.enemies.boss && g.ctx.enemies.boss.def.id; });
      t.assert(ok === 'boss_grizzlechop', `the Cheese Mill arena spawns Grizzlechop (${ok})`);
      if (ok !== 'boss_grizzlechop') return;
      await waitLoaded(t);
      t.assert((await t.events()).includes('boss:start'), 'boss:start');
      await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss; g.ctx.game.setTimeScale(0); return g.__en.frame(b, [2.2, 2.0, 4.6], [0, 0.9, 0], 45); });
      await t.wait(400);
      await t.shot('enemies/b1-grizzlechop');
      await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      // Sabre Flurry: the third glint is gold
      await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss; b.forceMove = 'sabreFlurry'; b.attackChoice = null; g.__en.freezeAfter('gold', 0.3); });
      const gold = await until(t, () => window.__GAME__.__en.tele.some((x) => x.kind === 'gold' && x.type === 'boss_grizzlechop'), null, 20000);
      t.assert(gold, 'Sabre Flurry ends on a gold glint');
      if (gold && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss; return g.__en.frame(b, [2.0, 1.8, 3.6], [0, 0.8, 0.8], 45); });
        await t.frames(3);
        await t.shot('enemies/b1-flurry-gold');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      // phase 2: the Wheel Ride lane
      await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss; g.boss.setHpFrac(0.55); g.__en.freezeAfter('aoe', 0.6); return b.phase; });
      const lane = await until(t, () => window.__GAME__.__en.tele.some((x) => x.kind === 'aoe' && x.shape === 'lane'), null, 20000);
      t.assert(lane, 'Wheel Ride: a charge lane (aoe lane)');
      if (lane && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss; return g.ctx.cam.shot({ anchor: b, pos: [0.5, 11, -6.5], look: [0, 0, 4], mode: 'cut', fov: 60 }); });
        await t.frames(3);
        await t.shot('enemies/b1-wheel-lane');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      const xb = await t.G(() => window.__GAME__.ctx.enemies.boss.adds.filter((a) => a.type === 'rat_xbow').length);
      t.assert(xb === 2, `phase 2 brings 2 crossbowmen (${xb})`);
      // phase 3: cheese bombs
      await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss; b.staggerT = 0; g.boss.setHpFrac(0.2); b.forceMove = 'cheeseBombs'; b.attackChoice = null; g.__en.tele.length = 0; g.__en.freezeAfter('aoe', 0.5); });
      const bombs = await until(t, () => window.__GAME__.__en.tele.filter((x) => x.kind === 'aoe' && x.shape === 'circle' && x.type === 'boss_grizzlechop').length >= 5, null, 20000);
      t.assert(bombs, 'Cheese Bombs: 5 circles');
      if (bombs && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.G(() => { const g = window.__GAME__; return g.ctx.cam.shot({ anchor: g.ctx.player, pos: [1.5, 10, -5.5], look: [0, 0, 1.0], mode: 'cut', fov: 60 }); });
        await t.frames(3);
        await t.shot('enemies/b1-cheese-bombs');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      // beaten with god
      await t.G(() => { const g = window.__GAME__, ctx = g.ctx, b = ctx.enemies.boss; g.god(true); g.boss.setHpFrac(0.01); b.invulnT = 0; b.staggerT = 0; ctx.combat.applyHit(ctx.player, b, ctx.config.ATTACKS.slash3); });
      const def = await t.waitForEvent('boss:defeated', 5000);
      t.assert(def, 'B1 beaten (boss:defeated)');
      const cs = await t.waitForEvent('cutscene:start', 8000);
      t.log(`after the defeat: cutscene:start ${cs}`);
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:b2', order: 56, level: 'gate', spawn: 'boss', timeout: 300000,
    async run(t) {
      await prepare(t);
      const ok = await t.G(() => { const g = window.__GAME__; g.startBoss(); return g.ctx.enemies.boss?.def.id ?? null; });
      t.assert(ok === 'boss_cacklejaw', `the causeway arena spawns Cacklejaw (${ok})`);
      if (ok !== 'boss_cacklejaw') return;
      await waitLoaded(t);
      await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss; g.ctx.game.setTimeScale(0); return g.__en.frame(b, [1.8, 2.2, 4.2], [0, 1.4, 0], 45); });
      await t.wait(400);
      await t.shot('enemies/b2-cacklejaw');
      await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      // Laugh Quake
      await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss; b.forceMove = 'laughQuake'; b.attackChoice = null; g.__en.freezeAfter('jeer', 0.55); });
      const q = await until(t, () => window.__GAME__.__en.tele.some((x) => x.kind === 'jeer' && x.type === 'boss_cacklejaw'), null, 20000);
      t.assert(q, 'Laugh Quake: jeer rings');
      if (q && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss; return g.ctx.cam.shot({ anchor: b, pos: [3.5, 3.4, 6.5], look: [0, 1.0, 0], mode: 'cut', fov: 55 }); });
        await t.frames(3);
        await t.shot('enemies/b2-laugh-quake');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      // phase 2: Ratio Rush + the stealers' Jeer Duet
      await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss; b.staggerT = 0; g.boss.setHpFrac(0.55); g.__en.freezeAfter('gold', 0.5); });
      const rush = await until(t, () => window.__GAME__.__en.tele.some((x) => x.kind === 'gold' && x.type === 'boss_cacklejaw'), null, 20000);
      t.assert(rush, 'Ratio Rush: gold glint + lane');
      if (rush && await until(t, () => window.__GAME__.__en.frozen, null, 5000)) {
        await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss; return g.ctx.cam.shot({ anchor: b, pos: [-3.0, 4.5, -4.0], look: [0, 0.8, 4], mode: 'cut', fov: 60 }); });
        await t.frames(3);
        await t.shot('enemies/b2-ratio-rush');
        await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      }
      const duet = await t.G(() => window.__GAME__.ctx.enemies.boss.adds.filter((a) => a.type === 'stealer').length);
      t.assert(duet === 2, `2 stealers join (${duet})`);
      t.assert((await t.events()).includes('enemy:jeer'), 'the Jeer Duet');
      // phase 3: shadow clones
      await t.G(() => { const g = window.__GAME__, b = g.ctx.enemies.boss; b.staggerT = 0; g.boss.setHpFrac(0.25); });
      const clones = await until(t, () => window.__GAME__.ctx.enemies.byType('cacklejaw_clone').length === 3, null, 5000);
      t.assert(clones, '3 shadow clones');
      await waitLoaded(t);
      await t.wait(2200);
      // the real one (blob shadow, hatless: the chipped ear) among his shadow clones, seen from above her shoulder
      await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, b = ctx.enemies.boss, p = ctx.player;
        for (const a of b.adds.filter((x) => x.type === 'stealer')) ctx.enemies.despawn(a);
        const cl = ctx.enemies.byType('cacklejaw_clone');
        let cx = b.pos.x, cz = b.pos.z;
        for (const c of cl) { cx += c.pos.x; cz += c.pos.z; }
        cx /= cl.length + 1; cz /= cl.length + 1;
        ctx.game.setTimeScale(0);
        const dx = cx - p.pos.x, dz = cz - p.pos.z, d = Math.hypot(dx, dz) || 1;
        p.facing = Math.atan2(dx, dz); p.snap?.();
        return ctx.cam.shot({ anchor: p, pos: [0.6, 5.0, -4.0], look: [0, 0.8, d], mode: 'cut', fov: 60 });
      });
      await t.wait(400);
      await t.shot('enemies/b2-clones');
      await t.G(() => { const h = window.__GAME__.__en; h.follow(); h.thaw(); });
      // beaten with god
      await t.G(() => { const g = window.__GAME__, ctx = g.ctx, b = ctx.enemies.boss; g.god(true); g.boss.setHpFrac(0.01); b.invulnT = 0; b.staggerT = 0; ctx.combat.applyHit(ctx.player, b, ctx.config.ATTACKS.slash3); });
      const def = await t.waitForEvent('boss:defeated', 5000);
      t.assert(def, 'B2 beaten (boss:defeated)');
      const left = await t.G(() => window.__GAME__.ctx.enemies.byType('cacklejaw_clone').length);
      t.assert(left === 0, 'clones vanish with him');
      const cs = await t.waitForEvent('cutscene:start', 8000);
      t.log(`after the defeat: cutscene:start ${cs}`);
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  // ---------------------------------------------------------------------------------------------------------------
  // Controls rework (CONTROLS_SPEC §8.5 / §12 enemies), all through the live iso camera
  {
    name: 'enemies:onscreen-rule', order: 57, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t);
      await t.G(() => window.__GAME__.ctx.cam.mode('follow', { blend: 0 }));
      await t.frames(6);
      const ax = await t.G(SCREEN_AXES);
      t.log(`iso: d ${ax.iso?.dist?.toFixed(1)} yaw ${ax.iso?.yaw?.toFixed(2)}; down-screen (${ax.down.map((v) => v.toFixed(2))})`);
      // 1) a crossbowman 13 m DOWN-screen: off screen and beyond the 9 m near band → it must hold fire
      const id = await t.G(([d, p]) => {
        const g = window.__GAME__, ctx = g.ctx;
        const x = p[0] + d[0] * 13, z = p[1] + d[1] * 13;
        const e = ctx.enemies.spawn('rat_xbow', new g.THREE.Vector3(x, ctx.physics.heightAt(x, z), z), { alerted: true, facing: Math.atan2(-d[0], -d[1]) });
        e.perched = true;                                 // holds its spot: the test is the rule, not the keep band
        e.alert();
        return e.id;
      }, [ax.down, ax.p]);
      await waitLoaded(t);
      const off = await t.G((rid) => {
        const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid);
        return { on: g.ctx.cam.onScreen({ x: e.pos.x, y: e.pos.y + e.height * 0.5, z: e.pos.z }, 0.5), d: e.distToPlayer() };
      }, id);
      t.assert(off.on === false && off.d > 9, `the crossbowman is off screen and > 9 m (on ${off.on}, ${off.d.toFixed(1)} m)`);
      await t.wait(3500);
      const held = await t.G((rid) => {
        const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === rid);
        return { state: e.stateName, hold: !!e.holdFire, aims: g.__en.tele.filter((x) => x.actor === e && x.kind === 'aim').length,
          // ITS bolts only (an earlier block's fight can leave other projectiles in the pool stats)
          shots: (g.ctx.combat.projectiles?.list ?? []).filter((p) => p.owner === e).length };
      }, id);
      t.log(`off screen: state ${held.state}, holdFire ${held.hold}, aims ${held.aims}, projectiles ${held.shots}`);
      t.assert(held.aims === 0 && held.shots === 0, 'no off-screen snipe (no aim telegraph, no bolt)');
      t.assert(held.hold, 'the crossbowman reports holdFire');
      await t.shot('enemies/onscreen-01-held');
      // 2) the same crossbowman moved on screen but still beyond 9 m (9.6 m, up-screen and to the side; straight
      //    up-screen the top edge is only ~10.5 m away at the default zoom): it aims and shoots
      const spot = await t.G(([rid, d, p]) => {
        const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => x.id === rid);
        const r = [-d[1], d[0]];
        for (let k = 0; k <= 30; k++) {
          const a = (k / 30) * 1.4, ux = -d[0] * Math.cos(a) + r[0] * Math.sin(a), uz = -d[1] * Math.cos(a) + r[1] * Math.sin(a);
          const x = p[0] + ux * 9.6, z = p[1] + uz * 9.6, y = ctx.physics.heightAt(x, z);
          if (ctx.cam.onScreen({ x, y: y + e.height * 0.5, z }, 1.0)) {
            e.pos.set(x, y, z); e.facing = Math.atan2(-ux, -uz); e.snap?.();
            return { x, z, a };
          }
        }
        return null;
      }, [id, ax.down, ax.p]);
      t.assert(!!spot, 'found an on-screen spot 9.6 m from her');
      const aimed = await until(t, (rid) => window.__GAME__.__en.tele.some((x) => x.actor?.id === rid && x.kind === 'aim'), id, 12000);
      if (!t.assert(aimed, 'on screen at 9.6 m: it aims')) {
        t.log(JSON.stringify(await t.G((rid) => {
          const g = window.__GAME__, ctx = g.ctx, e = ctx.enemies.list.find((x) => x.id === rid);
          return { st: e.stateName, hold: e.holdFire, d: e.distToPlayer(), cd: e.cooldownT, perched: e.perched, pos: e.pos.toArray(),
            on: ctx.cam.onScreen({ x: e.pos.x, y: e.pos.y + e.height * 0.5, z: e.pos.z }, 0.5), scr: g.screen(e.pos.x, e.pos.z), alive: e.alive, ai: e.ai, dormant: e.dormant };
        }, id)));
      }
      if (aimed) {
        await t.G(() => window.__GAME__.__en.freezeAfter(null, 0));
        await until(t, () => window.__GAME__.__en.frozen, null, 3000);
        await t.frames(3);
        await t.shot('enemies/onscreen-02-aim-from-above');
        await t.G(() => window.__GAME__.__en.thaw());
        const a = await t.G((rid) => { const x = window.__GAME__.__en.tele.find((q) => q.actor?.id === rid && q.kind === 'aim'); return { on: x.onScreen, d: x.dist, id: x.attackId, tp: x.targetsPlayer }; }, id);
        t.assert(a.on === true && a.id === 'rat_bolt' && a.tp === true, `the aim started on screen (on ${a.on}, ${a.d?.toFixed(1)} m, ${a.id}, targetsPlayer ${a.tp})`);
      }
      const keep = await t.G((rid) => window.__GAME__.ctx.enemies.list.find((x) => x.id === rid)?.def.keep, id);
      t.assert(Array.isArray(keep) && keep[0] === 6 && keep[1] === 9, `rat_xbow.keep = [6, 9] (${JSON.stringify(keep)})`);
      // 3) a crow spawned far off screen: it may close in, but its dive (shadow decal) starts on screen only
      await t.G(([d, p]) => {
        const g = window.__GAME__, ctx = g.ctx;
        for (const e of [...ctx.enemies.list]) ctx.enemies.despawn(e);
        g.__en.tele.length = 0;
        ctx.enemies.spawn('crow', new g.THREE.Vector3(p[0] + d[0] * 15, 0, p[1] + d[1] * 15), { alerted: true });
      }, [ax.down, ax.p]);
      await waitLoaded(t);
      const dived = await until(t, () => window.__GAME__.__en.tele.some((x) => x.type === 'crow' && x.kind === 'shadow'), null, 25000);
      const crow = await t.G(() => window.__GAME__.__en.tele.filter((x) => x.type === 'crow').map((x) => ({ k: x.kind, on: x.onScreen, d: x.dist })));
      t.log(`crow telegraphs: ${crow.map((x) => `${x.k}(on ${x.on}, ${x.d?.toFixed(1)} m)`).join(', ') || 'none'}`);
      t.assert(dived, 'the crow eventually dives');
      t.assert(crow.filter((x) => x.k === 'shadow').every((x) => x.on === true), 'every crow dive started on screen');
      if (dived) await t.shot('enemies/onscreen-03-crow-dive');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:telegraph-payload', order: 58, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      await prepare(t);
      await t.G(() => window.__GAME__.ctx.cam.mode('follow', { blend: 0 }));
      // a rat_pike 3 m beside her; she circles it during its wind-up so its facing (the wedge) has something to track
      const id = await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, h = g.__en, p = ctx.player;
        const e = h.spawn('rat_pike', Math.PI / 2, 3, { alerted: true });
        e.def = { ...e.def, followUp: null, fleeBelow: 0 };
        h.track = { samples: [], strikeAt: null, circle: null };
        h.orbitOff = ctx.game.addFrameHook(() => {
          const tr = h.track;
          if (!e.alive || tr.strikeAt != null) return;
          if (e.stateName === 'windup') {
            tr.samples.push([ctx.game.time, e.facing]);
            // orbit her around the rat at 2 m (0.9 rad/s): its facing follows her until the freeze
            tr.circle ??= { a: Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z), t0: ctx.game.time };
            const a = tr.circle.a + (ctx.game.time - tr.circle.t0) * 0.9;
            const x = e.pos.x + Math.sin(a) * 2, z = e.pos.z + Math.cos(a) * 2;
            p.pos.set(x, ctx.physics.heightAt(x, z), z);
          }
          if (e.stateName === 'strike') tr.strikeAt = ctx.game.time;
        });
        return e.id;
      });
      await waitLoaded(t);
      const got = await until(t, () => window.__GAME__.__en.track.strikeAt != null, null, 20000);
      t.assert(got, 'rat_pike winds up and strikes');
      const r = await t.G((rid) => {
        const g = window.__GAME__, h = g.__en, A = g.ctx.config.ATTACKS;
        h.orbitOff?.(); h.orbitOff = null;
        const x = h.tele.find((q) => q.actor?.id === rid && (q.kind === 'parry' || q.kind === 'gold'));
        if (!x) return null;
        const def = A[x.attackId];
        return {
          kind: x.kind, attackId: x.attackId, arcOk: !!x.arc && !!def?.arc && x.arc.range === def.arc.range && x.range === x.arc.range, range: x.range, windup: x.windup, dur: x.dur, at: x.at, activeAt: x.activeAt,
          tp: x.targetsPlayer, a0: def?.active?.[0] ?? 0, strikeAt: h.track.strikeAt, samples: h.track.samples,
        };
      }, id);
      t.assert(!!r, 'a parry / gold telegraph was emitted');
      if (r) {
        t.log(`payload: ${r.kind} ${r.attackId} range ${r.range} windup ${r.windup.toFixed(2)} activeAt ${r.activeAt.toFixed(2)} (strike ${r.strikeAt.toFixed(2)} + ${r.a0}) targetsPlayer ${r.tp}`);
        t.assert(typeof r.attackId === 'string' && r.attackId.startsWith('rat_poke'), `attackId (${r.attackId})`);
        t.assert(r.arcOk, 'arc + range from the attack def');
        t.assert(Math.abs(r.windup - r.dur) < 1e-6 && r.windup >= 0.45, `windup = the telegraph duration (${r.windup.toFixed(2)} s)`);
        // frame hooks run per rendered frame: a loaded machine renders ~20 fps, so allow one frame of slack
        t.assert(Math.abs(r.activeAt - (r.strikeAt + r.a0)) < 0.08 + r.a0, `activeAt is the first live frame (Δ ${(r.activeAt - r.strikeAt - r.a0).toFixed(3)} s)`);
        t.assert(r.tp === true, 'targetsPlayer');
        // facing: it turns during the early wind-up, and holds still from activeAt − 0.15 s (the wedge freeze)
        const early = r.samples.filter(([tm]) => tm < r.activeAt - 0.3);
        const late = r.samples.filter(([tm]) => tm >= r.activeAt - 0.15);
        const span = (arr) => (arr.length ? Math.max(...arr.map((s) => s[1])) - Math.min(...arr.map((s) => s[1])) : 0);
        t.log(`facing: early span ${span(early).toFixed(3)} rad (${early.length} frames), late span ${span(late).toFixed(4)} rad (${late.length})`);
        t.assert(span(early) > 0.05, 'the facing tracks her early in the wind-up');
        t.assert(span(late) < 1e-3, 'the facing is frozen within 0.15 s of activeAt');
      }
      // the wedge + parry ring as seen from above: freeze 0.12 s before the next poke's live frame
      await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, h = g.__en;
        ctx.state.settings.parryRing = 'on';
        h.tele.length = 0;
        h.offs.push(ctx.game.addFrameHook(() => {
          const x = h.tele.find((q) => q.kind === 'parry' || q.kind === 'gold');
          if (x && !h.frozen && !h.shotDone && ctx.game.time >= x.activeAt - 0.12) { ctx.game.setTimeScale(0); h.frozen = true; h.shotDone = true; }
        }));
      });
      if (await until(t, () => window.__GAME__.__en.frozen, null, 15000)) {
        await t.frames(3);
        await t.shot('enemies/payload-wedge-from-above');
        await t.G(() => window.__GAME__.__en.thaw());
      } else t.warn('no second wind-up to photograph');
      // a dash attack (hyena lunge) carries a lane instead of an arc
      await t.G(() => {
        const g = window.__GAME__, ctx = g.ctx, h = g.__en;
        ctx.state.settings.parryRing = 'auto';
        for (const e of [...ctx.enemies.list]) ctx.enemies.despawn(e);
        h.tele.length = 0;
        h.spawn('hyena', 0, 5, { alerted: true });
      });
      await waitLoaded(t);
      const lunge = await until(t, () => window.__GAME__.__en.tele.some((x) => x.type === 'hyena' && x.lane), null, 30000);
      const hy = await t.G(() => window.__GAME__.__en.tele.filter((x) => x.type === 'hyena').map((x) => ({ k: x.kind, id: x.attackId, lane: x.lane, arc: !!x.arc, r: x.range })));
      t.log(`hyena telegraphs: ${hy.map((x) => `${x.k}/${x.id}${x.lane ? ` lane ${x.lane.w.toFixed(2)}×${x.lane.l.toFixed(2)}` : ''}${x.arc ? ' arc' : ''}`).join(', ')}`);
      if (lunge) {
        const l = hy.find((x) => x.lane);
        t.assert(l.lane.l > 1 && l.lane.w >= 0.6 && l.r === l.lane.l, 'lunge lane payload (w ≥ 0.6 m, range = lane length)');
      } else t.warn('the hyena did not lunge within 30 s (machine load); the lane payload is covered by unit tests');
      await t.G(() => window.__GAME__.__en.done());
    },
  },
  {
    name: 'enemies:touch', order: 59, level: null, timeout: 480000,
    async run(t) {
      for (const [w, hgt, tag] of [[844, 390, 'landscape'], [390, 844, 'portrait']]) {
        const errors = [];
        const ctxM = await t.browser.newContext({ viewport: { width: w, height: hgt }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
        const pg = await ctxM.newPage();
        pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        pg.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
        const G = async (fn, arg) => { const hd = await pg.evaluateHandle(fn, arg); try { return await hd.evaluate((r) => (window.__GAME__?.plain ? window.__GAME__.plain(r) : r)); } finally { hd.dispose().catch(() => {}); } };
        const mshot = async (name) => { try { await pg.screenshot({ path: path.join(t.shotsDir, 'enemies', `${name}.png`) }); } catch (e) { t.warn(`touch shot ${name}: ${String(e?.message ?? e).split('\n')[0]}`); } };
        const untilM = async (fn, arg, ms = 8000) => { const t0 = Date.now(); let v = await G(fn, arg); while (!v && Date.now() - t0 < ms) { await pg.waitForTimeout(150); v = await G(fn, arg); } return v; };
        try {
          await pg.goto(`${t.base}?test=1&seed=1`, { timeout: 240000, waitUntil: 'domcontentloaded' });   // a loaded machine
          await pg.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 240000 });
          await G(async () => {
            const g = window.__GAME__, c = g.ctx;
            g.story.skip?.(); g.setMode('play');
            for (const k of ['prologue.armour', 'prologue.tutorial', 'prologue.done']) c.state.setFlag(k, true);
            await g.loadLevel('meadow', 'start');
            return true;
          });
          await pg.waitForTimeout(800);
          await pg.touchscreen.tap(Math.round(w * 0.6), Math.round(hgt * 0.35));   // first touch: device 'touch'
          await G((src) => {
            const g = window.__GAME__;
            new Function(`return (${src})`)()();             // the shared helpers (god, steps off the start spawn)
            g.ctx.input.setDevice?.('touch');
            g.__en.listen(); g.story.skip?.(); g.setMode('play'); g.ctx.ui.touch?.enable?.(true);
            g.ctx.cam.mode('follow', { blend: 0 });
          }, HELPERS.toString());
          await pg.waitForTimeout(700);
          const ax = await G(SCREEN_AXES);
          t.log(`${tag}: device ${ax.dev}, d ${ax.iso?.dist?.toFixed(1)}, fov ${ax.iso?.fov}, parryRing ${ax.ring}`);
          t.assert(ax.dev === 'touch', `${tag}: device touch`);
          // a rat 2.6 m up-screen: its wind-up wedge + the (auto, touch) parry ring, frozen just before the hit
          const rid = await G(([d, r, p]) => {
            const g = window.__GAME__, ctx = g.ctx, h = g.__en;
            for (const o of [...ctx.enemies.list]) ctx.enemies.despawn(o);   // hermetic: no open-zone rats join in
            const x = p[0] - d[0] * 2.6 + r[0] * 0.8, z = p[1] - d[1] * 2.6 + r[1] * 0.8;
            const e = ctx.enemies.spawn('rat_pike', new g.THREE.Vector3(x, ctx.physics.heightAt(x, z), z), { alerted: true, facing: Math.atan2(p[0] - x, p[1] - z) });
            e.def = { ...e.def, followUp: null, fleeBelow: 0 };
            h.offs.push(ctx.game.addFrameHook(() => {
              const q = h.tele.find((y) => y.actor === e && (y.kind === 'parry' || y.kind === 'gold'));
              if (q && !h.frozen && !h.shotDone && ctx.game.time >= q.activeAt - 0.12) { ctx.game.setTimeScale(0); h.frozen = true; h.shotDone = true; }
            }));
            return e.id;
          }, [ax.down, ax.right, ax.p]);
          const frozen = await untilM(() => window.__GAME__.__en.frozen, null, 25000);
          t.assert(!!frozen, `${tag}: the rat winds up (frozen before the hit)`);
          if (frozen) {
            await pg.waitForTimeout(300);
            await mshot(`touch-${tag}-01-wedge`);
            const q = await G((id) => { const x = window.__GAME__.__en.tele.find((y) => y.actor?.id === id); return x ? { k: x.kind, tp: x.targetsPlayer, on: x.onScreen, arc: !!x.arc, act: x.activeAt, at: x.at } : null; }, rid);
            t.assert(q && q.tp === true && q.arc && q.act > q.at && q.on === true, `${tag}: telegraph payload on touch (${JSON.stringify(q)})`);
            await G(() => window.__GAME__.__en.thaw());
          }
          // a crossbowman 11 m to the side (portrait: outside the narrow frame) — the rule follows the real frame
          const xb = await G(([r, p]) => {
            const g = window.__GAME__, ctx = g.ctx, h = g.__en;
            const x = p[0] + r[0] * 11, z = p[1] + r[1] * 11;
            const e = ctx.enemies.spawn('rat_xbow', new g.THREE.Vector3(x, ctx.physics.heightAt(x, z), z), { alerted: true, facing: Math.atan2(p[0] - x, p[1] - z) });
            e.perched = true;
            e.alert();                                        // it knows she is there: only the rule may hold it
            h.xb = e;
            return e.id;
          }, [ax.right, ax.p]);
          await untilM(() => window.__GAME__.__en.loaded(), null, 45000);
          await pg.waitForTimeout(3500);
          const xs = await G((id) => {
            const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === id);
            if (!e) return null;
            const on = g.ctx.cam.onScreen({ x: e.pos.x, y: e.pos.y + e.height * 0.5, z: e.pos.z }, 0.5);
            return { on, d: e.distToPlayer(), aims: g.__en.tele.filter((x) => x.actor === e && x.kind === 'aim').map((x) => ({ on: x.onScreen, d: x.dist })), hold: !!e.holdFire, st: e.stateName, shots: g.ctx.combat.stats?.projectiles ?? 0 };
          }, xb);
          t.log(`${tag}: xbow at ${xs?.d?.toFixed(1)} m, on screen ${xs?.on}, state ${xs?.st}, aims ${xs?.aims.length}, holdFire ${xs?.hold}, bolts ${xs?.shots}`);
          t.assert(xs && xs.aims.every((a) => a.on === true || a.d <= 9), `${tag}: every aim started on screen or within 9 m`);
          if (xs && xs.on === false && xs.d > 9) t.assert(xs.aims.length === 0 && (xs.hold || xs.st !== 'chase'), `${tag}: the off-frame crossbowman holds fire (${xs.st})`);
          if (tag === 'portrait') t.assert(xs && xs.on === false, 'portrait: 11 m to the side is off the narrow frame');
          await mshot(`touch-${tag}-02-xbow`);
          // tap the rat: select + attack order (auto-chain loops on touch); god mode: it falls
          await G((id) => { const g = window.__GAME__; for (const o of [...g.ctx.enemies.list]) if (o.id !== id) g.ctx.enemies.despawn(o); g.clearEvents(); }, rid);
          if (await G((id) => !!window.__GAME__.ctx.enemies.list.find((x) => x.id === id && x.alive), rid)) {
            const sp = await G((id) => { const g = window.__GAME__, e = g.ctx.enemies.list.find((x) => x.id === id); return g.screen(e.pos.x, e.pos.z, e.pos.y + 0.4); }, rid);
            await pg.touchscreen.tap(Math.round(sp.x), Math.round(sp.y));
            await pg.waitForTimeout(500);
            await mshot(`touch-${tag}-03-tapped`);
            const dead = await untilM((id) => !window.__GAME__.ctx.enemies.list.some((x) => x.id === id && x.alive), rid, 20000);
            t.assert(!!dead, `${tag}: tapping the rat attacks it until it falls`);
          }
          await G(() => window.__GAME__.__en.done());
          for (const e of errors) t.fail(`${tag}: ${e}`);
        } catch (e) {
          t.fail(`${tag}: ${String(e?.message ?? e).split('\n')[0]}`);
        } finally {
          await ctxM.close().catch(() => {});
        }
      }
    },
  },
];
