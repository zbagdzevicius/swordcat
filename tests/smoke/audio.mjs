// tests/smoke/audio.mjs  (owner: audio) — GAME_DESIGN §16 in the running game: the gesture unlock, meadow music + wind,
// gameplay SFX from real input (swings, footsteps, meow, hits, kill), the combat ↔ explore music rule, every manifest
// file decoding in Chromium, the procedural layer (laugh build, chorus, Sunbell, clunk, heartbeat, shimmer, march),
// Meme Cam / dialogue / hitstop ducks, the voice limits, and the CS-00…CS-03 audio cue sheets.
// Screenshots (with the debug audio meter on) go to tests/shots/audio/.
import fs from 'node:fs';
import path from 'node:path';

const A = 'window.__GAME__.ctx.audio';
const st = (t) => t.G(() => window.__GAME__.ctx.audio.debugState());
const shot = async (t, name) => {
  fs.mkdirSync(path.join(t.shotsDir, 'audio'), { recursive: true });
  for (let i = 0; i < 2; i++) {
    try { return await t.shot(`audio/${name}`); } catch (e) { t.warn(`screenshot ${name} attempt ${i + 1}: ${String(e?.message ?? e).split('\n')[0]}`); }
  }
  return null;
};

/** The explore track the director should come back to on this level (meadow: the bards' tale until prologue.done). */
const exploreNow = (t) => t.G(() => window.__GAME__.ctx.audio.director.level.explore);

/** Wait (polling) until `fn()` in the page is truthy; resolves true/false. */
const until = async (t, fn, ms, arg) => {
  try { await t.page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; }
};

/** Peak RMS of a bus over `ms` (sampled every animation frame in the page). */
const peak = (t, bus, ms) => t.page.evaluate(([b, d]) => new Promise((res) => {
  const a = window.__GAME__.ctx.audio, t0 = performance.now();
  let m = 0;
  const f = () => { m = Math.max(m, a.level(b)); if (performance.now() - t0 < d) requestAnimationFrame(f); else res(m); };
  f();
}), [bus, ms]);

/** Make sure the context runs: a real key press is the user gesture (KeyU is unbound). */
async function unlock(t) {
  const ready = await t.G(() => { const a = window.__GAME__.ctx.audio; return a.ready && a.ac?.state === 'running'; });
  if (ready) return true;
  await t.page.keyboard.press('KeyU');
  try {
    await t.page.waitForFunction(() => { const a = window.__GAME__.ctx.audio; return a.ready && a.ac?.state === 'running' && a.zz.size >= 4; }, null, { timeout: 20000, polling: 50 });
    return true;
  } catch { t.fail('audio did not unlock after a key press'); return false; }
}

const db = (rms) => (rms > 1e-6 ? 20 * Math.log10(rms) : -120).toFixed(1);

export default [
  {
    name: 'audio:unlock', order: 80, level: 'meadow', spawn: 'start', timeout: 90000,
    async run(t) {
      const pre = await t.G(() => {
        const g = window.__GAME__, a = g.ctx.audio;
        return { ready: a.ready, track: a.currentTrack, state: a.ac?.state ?? null, prologueDone: !!g.ctx.state.getFlag('prologue.done') };
      });
      const want = pre.prologueDone ? 'field_of_dreams' : 'village_bards_tale';
      t.log(`before the gesture: ready=${pre.ready} ctx=${pre.state} wanted=${pre.track} (prologue.done=${pre.prologueDone})`);
      t.assert(pre.track === want, `meadow explore track requested on load: ${pre.track} (want ${want})`);
      if (!(await unlock(t))) return;
      await t.G(() => window.__GAME__.ctx.audio.showMeter(true));
      let musicOk = true;
      try { await t.page.waitForFunction(() => window.__GAME__.ctx.audio.level('music') > 0.002, null, { timeout: 10000, polling: 100 }); }
      catch { musicOk = false; }
      const s = await st(t);
      t.assert(musicOk, `music bus silent 10 s after the unlock (deck: ${JSON.stringify(s.music?.decks)})`);
      t.assert(s.music.track === want && s.music.decks.some((d) => d.track === want && d.playing), `${want} deck playing`);
      // after CS-02 (prologue.done) the same load explores to field_of_dreams
      if (!pre.prologueDone) {
        await t.G(() => window.__GAME__.ctx.state.setFlag('prologue.done', true));
        await t.loadLevel('meadow', 'start');
        const day = await t.G(() => window.__GAME__.ctx.audio.currentTrack);
        t.assert(day === 'field_of_dreams', `day meadow explore track ${day}`);
        await until(t, () => { const m = window.__GAME__.ctx.audio.musicPlayer.state(); return m.decks.some((d) => d.track === 'field_of_dreams' && d.playing); }, 8000);
        await t.G(() => window.__GAME__.ctx.state.setFlag('prologue.done', false));
      }
      t.assert(s.wind && s.wind.gainNow > 0.03, `procedural wind running (gain ${s.wind?.gainNow})`);
      t.assert(['heartThump', 'crowCaw', 'hyenaLaugh', 'blip'].every((k) => s.zzfx.includes(k)), `zzfx baked: ${s.zzfx}`);
      t.assert(s.gains.master > 0.5 && s.gains.music > 0.2 && s.gains.sfx > 0.5, `bus gains ${JSON.stringify(s.gains)}`);
      const listeners = await t.G(() => window.__GAME__.ctx.camera.children.filter((c) => c.type === 'AudioListener').length);
      t.assert(listeners === 1, `exactly one AudioListener on the camera (${listeners})`);
      const m = await peak(t, 'master', 600);
      t.log(`unlocked: sr=${s.sampleRate} music ${db(s.levels.music)} dB, master peak ${db(m)} dB, wind ${s.wind.wind} → ${s.wind.freqNow} Hz`);
      await shot(t, '01-unlock-meadow');
      // the level reload above re-requested the prologue/day track: put the night track back for the next blocks
      if (!pre.prologueDone) await t.loadLevel('meadow', 'start');
    },
  },
  {
    name: 'audio:gameplay', order: 81, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      if (!(await unlock(t))) return;
      await t.G(() => window.__GAME__.ctx.audio.showMeter(true));
      const s0 = await st(t);
      const c0 = s0.started;
      // swings (light combo) — the sfx bus must actually carry signal
      const pk = peak(t, 'sfx', 1400);
      await t.tap('KeyJ', 3, 260);
      const sfxPeak = await pk;
      await t.wait(400);
      // footsteps (Player emits actor:footstep) + armour rattle every 2nd step
      await t.hold('KeyW', 1500);
      // meow (a short hold: the press edge must survive to the next fixed step)
      await t.hold('KeyC', 90);
      await t.wait(350);
      const s1 = await st(t);
      const d = (k) => (s1.started[k] ?? 0) - (c0[k] ?? 0);
      t.assert(d('swishLight') + d('swishHeavy') >= 2, `swing swishes started: ${d('swishLight')} light / ${d('swishHeavy')} heavy`);
      // her steps follow level.surfaceAt (meadow: grass, the dirt lane, the bridge's stone)
      const FOOT = ['footGrass', 'footDirt', 'footStone', 'footWood', 'footMud', 'footSnow', 'footWater'];
      const steps = FOOT.reduce((n, k) => n + d(k), 0);
      const stepMix = FOOT.filter((k) => d(k) > 0).map((k) => `${k} ${d(k)}`).join(', ');
      const surf = await t.G(() => { const g = window.__GAME__, p = g.ctx.player.pos; return g.ctx.levels.current?.surfaceAt?.(p.x, p.z) ?? null; });
      t.assert(steps >= 3, `footsteps started: ${steps} (${stepMix})`);
      t.assert(d('armorStep') >= 1, `armour rattle every 2nd step: ${d('armorStep')}`);
      const meowEv = (await t.events()).includes('player:meow');
      t.assert(d('meow') >= 1, `meow started: ${d('meow')} (player:meow emitted: ${meowEv}, requested: ${s1.counts.meow ?? 0})`);
      t.assert(sfxPeak > 0.002, `sfx bus peak during the combo ${db(sfxPeak)} dB`);
      t.log(`swish ${d('swishLight')}+${d('swishHeavy')} steps ${steps} [${stepMix}; under her now: ${surf}] armour ${d('armorStep')} meow ${d('meow')}, sfx peak ${db(sfxPeak)} dB`);
      await shot(t, '02-gameplay-sfx');

      // a rat within 20 m: combat music; kill it: hit + poof + death squeak; explore 4 s after the last threat
      await t.G(() => window.__GAME__.god(true));
      const p = (await t.state()).player.pos;
      await t.G(([x, z]) => window.__GAME__.spawn('rat_pike', x, z), [p[0] + 1.6, p[2] + 1.6]);
      let combat = true;
      try { await t.page.waitForFunction(() => window.__GAME__.ctx.audio.director.combat, null, { timeout: 8000, polling: 100 }); }
      catch { combat = false; }
      t.assert(combat, 'combat music did not start with an alerted rat within 20 m');
      await t.wait(1200);
      const sc = await st(t);
      t.assert(sc.director.target === 'battle_fast_fight_loop', `combat track ${sc.director.target}`);
      t.log(`combat: ${sc.music.decks.map((k) => `${k.track ?? '-'}@${k.gain}`).join(' | ')}`);
      await shot(t, '03-combat-music');
      // finish the rat: hits until dead (god on; the swing auto-aims within 3 m)
      for (let i = 0; i < 16; i++) {
        const alive = await t.G(() => window.__GAME__.ctx.enemies.list.filter((e) => e.alive && !e.tags?.has?.('prop')).length);
        if (!alive) break;
        await t.G(() => {
          const g = window.__GAME__, pl = g.ctx.player;
          for (const e of g.ctx.enemies.list) {
            if (!e.alive || e.tags?.has?.('prop')) continue;
            e.hp = Math.min(e.hp, 1);
            if (Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z) > 2.2) g.teleport(e.pos.x - 1.2, e.pos.y, e.pos.z - 1.2);
            pl.facing = Math.atan2(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z);
          }
        });
        await t.tap('KeyJ', 1);
        await t.wait(450);
      }
      const s2 = await st(t);
      const e = (k) => (s2.started[k] ?? 0) - (s1.started[k] ?? 0);
      t.assert(e('hitFur') >= 1, `rat hit sound (sword_attack): ${e('hitFur')}`);
      t.assert(e('killPoof') >= 1 && e('ratDeath') >= 1, `kill poof ${e('killPoof')} + death squeak ${e('ratDeath')}`);
      // "Explore resumes 4 s after the last kill" (sim time: under load the game runs slower than the wall clock)
      const explore = await exploreNow(t);
      const calm = await until(t, (x) => { const d = window.__GAME__.ctx.audio.director; return !d.combat && d.target === x; }, 25000, explore);
      if (!calm) {
        const why = await t.G(() => {
          const g = window.__GAME__, a = g.ctx.audio, d = a.director, p = g.ctx.player.pos;
          return { target: d.target, base: d.base, combat: d.combat, calmT: +d.calmT.toFixed(2), arenas: [...d.arenas], threat: a._threat, mode: g.ctx.game.mode,
            enemies: g.ctx.enemies.list.filter((e) => e.alive).map((e) => `${e.def?.id}:${e.stateName}@${Math.hypot(e.pos.x - p.x, e.pos.z - p.z).toFixed(1)}m`) };
        });
        t.fail(`explore music (${explore}) did not resume after the fight: ${JSON.stringify(why)}`);
      }
      await t.G(() => window.__GAME__.god(false));
    },
  },
  {
    name: 'audio:decode', order: 82, level: 'meadow', spawn: 'start', timeout: 150000,
    async run(t) {
      if (!(await unlock(t))) return;
      // every SFX file in the manifest decodes in Chromium (streamed music is checked by the decks above)
      const r = await t.page.evaluate(async () => {
        const a = window.__GAME__.ctx.audio;
        const paths = [...new Set(a.index.values())].filter((p) => p.startsWith('audio/sfx/'));
        const t0 = performance.now();
        await Promise.all(paths.map((p) => a.decode(p)));
        const missing = paths.filter((p) => !a.buffers.has(p));
        const n = a.buffers.size;
        const dropped = a.evict(window.__GAME__.levelId);
        return { total: paths.length, missing, ms: Math.round(performance.now() - t0), decoded: n, dropped, kept: a.buffers.size };
      });
      t.assert(r.missing.length === 0, `files that did not decode: ${r.missing.join(', ')}`);
      t.log(`decoded ${r.total} sfx files in ${r.ms} ms; evict → kept ${r.kept} (dropped ${r.dropped})`);
      t.assert(r.dropped > 0 && r.kept < r.decoded, 'evict() keeps only the level working set');
    },
  },
  {
    name: 'audio:defs', order: 83, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      if (!(await unlock(t))) return;
      const r = await t.page.evaluate(async () => {
        const a = window.__GAME__.ctx.audio, SFX = a.defs;
        const failed = [];
        for (const name of Object.keys(SFX)) {
          const before = a.started[name] ?? 0;
          for (const f of SFX[name].files) await a.decode(f);
          a._gates.clear();
          a.play2D(name, { volume: 0.05 });
          await new Promise((r) => setTimeout(r, 5));
          if ((a.started[name] ?? 0) <= before) failed.push(name);
        }
        a.stopAll(0.02);
        return { n: Object.keys(SFX).length, failed };
      }).catch((e) => ({ n: 0, failed: [`evaluate: ${e.message}`] }));
      t.assert(r.failed.length === 0, `SFX defs that did not start: ${r.failed.join(', ')}`);
      t.log(`${r.n} SFX defs started`);
    },
  },
  {
    name: 'audio:procedural', order: 84, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      if (!(await unlock(t))) return;
      await t.G(() => window.__GAME__.ctx.audio.showMeter(true));
      const s0 = await st(t);
      // laugh build at 6 m in front, then the CS-02 chorus (6 emitters at r 18)
      const l = await t.G(() => {
        const g = window.__GAME__, a = g.ctx.audio, p = g.ctx.player.pos;
        for (const s of ['creature/c80_troll_01', 'creature/c80_weird_01']) a.decode(s);
        const h = a.laugh(new g.THREE.Vector3(p.x + 4, p.y + 1, p.z + 4), { rate: 0.85 });
        return h ? { syllables: h.syllables, length: h.length } : null;
      });
      t.assert(l && l.syllables >= 4 && l.syllables <= 7, `laugh build syllables ${l?.syllables}`);
      const lp = await peak(t, 'sfx', 700);
      t.assert(lp > 0.001, `laugh audible on the sfx bus (${db(lp)} dB)`);
      const n = await t.G(() => window.__GAME__.ctx.audio.laughChorus(window.__GAME__.ctx.player, { count: 6, r: 18, dur: 6 }));
      t.assert(n === 6, `chorus emitters ${n}`);
      await t.wait(1500);
      const s1 = await st(t);
      t.assert((s1.started.laugh ?? 0) - (s0.started.laugh ?? 0) >= 3, `chorus laughs started ${(s1.started.laugh ?? 0) - (s0.started.laugh ?? 0)}`);
      t.log(`laugh ${l.syllables} syllables ${l.length.toFixed(2)} s; chorus laughs ${(s1.started.laugh ?? 0) - (s0.started.laugh ?? 0)}; v3D ${s1.voices3D}`);
      await shot(t, '04-laugh-chorus');
      await t.G(() => window.__GAME__.ctx.audio.stopLaughs());
      // Sunbell + damped clunk, heartbeat, shimmer, march
      await t.G(() => { const a = window.__GAME__.ctx.audio; a.bell(); a.bell({ damped: true }); a.heartbeat({ beats: 2 }); a.shimmer(true); a.march(true, { center: window.__GAME__.ctx.player }); });
      const bp = await peak(t, 'sfx', 900);
      const s2 = await st(t);
      const d = (k) => (s2.started[k] ?? 0) - (s1.started[k] ?? 0);
      t.assert(d('bell') === 2 && s2.bells === 2, `bells started ${d('bell')} live ${s2.bells}`);
      t.assert(d('heartbeat') === 2, `heartbeat beats ${d('heartbeat')}`);
      t.assert(s2.shimmer, 'Golden Hour shimmer pad on');
      t.assert(s2.marching && Object.keys(s2.started).some((k) => k.startsWith('footsteps/sand_')), 'horde march steps');
      t.assert(bp > 0.005, `bell / pad audible (${db(bp)} dB)`);
      t.log(`bell+pad+heartbeat peak ${db(bp)} dB`);
      await shot(t, '05-bell-shimmer');
      await t.G(() => { const a = window.__GAME__.ctx.audio; a.shimmer(false); a.march(false); a.stopAll(0.1); });
    },
  },
  {
    name: 'audio:ducks', order: 85, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      if (!(await unlock(t))) return;
      await t.G(() => window.__GAME__.ctx.audio.showMeter(true));
      // Meme Cam (§7.8 / §16.1): music ducks to 0 over ~1 s, the wind ×1.6
      await t.clearEvents();
      await t.G(() => window.__GAME__.idle(16));
      const meme = await t.waitForEvent('camera:meme', 5000);
      if (!meme) {                         // player/camera own the trigger; audio only reacts to camera:meme
        t.warn('camera:meme not emitted after idle(16) (player/camera); emitting it directly to test the audio side');
        await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.MEME_CAM, { on: true }); });
      }
      await t.wait(1300);
      const s = await st(t);
      const envWind = await t.G(() => window.__GAME__.ctx.env.wind);
      t.assert(s.meme && s.duckNow < 0.08, `music duck in Meme Cam ${s.duckNow} (want → 0 within ~1 s)`);
      t.assert(Math.abs(s.wind.wind - Math.min(3, envWind * 1.6)) < 0.05, `wind ×1.6 in Meme Cam (${s.wind.wind} vs env ${envWind})`);
      t.log(`meme: duck ${s.duckNow}, wind ${envWind} → ${s.wind.wind}, music ${db(s.levels.music)} dB`);
      await shot(t, '06-memecam-silent');
      await t.page.keyboard.press('KeyW');
      if (!meme) await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.MEME_CAM, { on: false }); });
      await t.wait(900);
      const s2 = await st(t);
      t.assert(!s2.meme && s2.duckNow > 0.8, `music back after Meme Cam (${s2.duckNow})`);
      // dialogue babble: −6 dB under the line, blips from the speaker's pool, back to full after dialog:end
      // sampled inside the page on animation frames (a loaded machine can take seconds per protocol round trip,
      // longer than the whole line)
      const bb = await t.page.evaluate(() => new Promise((res) => {
        const g = window.__GAME__, a = g.ctx.audio;
        a._gates.clear();
        g.ctx.bus.emit(g.E.DIALOG_START, { id: 'cs03' });
        g.ctx.bus.emit(g.E.DIALOG_LINE, { speaker: 'swordcat', text: 'Day one of rescuing everyone. Morale: high.' });
        const plan = a.babbleState?.plan.length ?? 0, t0 = performance.now();
        const f = () => {
          const b = a.babbleState;
          if (!b || b.blips >= 3 || performance.now() - t0 > 8000) {
            res({ plan, blips: b?.blips ?? null, speaker: b?.speaker ?? null, duck: a.duck, duckNow: +a.bus.musicDuck.gain.value.toFixed(3) });
          } else requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }));
      t.assert(bb.plan >= 8, `babble plan ${bb.plan} blips`);
      t.assert(bb.blips >= 3 && bb.speaker === 'swordcat', `babble blips ${bb.blips} (${bb.speaker})`);
      t.assert(Math.abs(bb.duck - 0.5) < 1e-6 && bb.duckNow < 0.62, `dialogue duck ${bb.duck} / now ${bb.duckNow}`);
      t.log(`babble: ${bb.blips}/${bb.plan} blips, music duck ${bb.duckNow}`);
      await shot(t, '07-dialogue-babble');
      await t.wait(1200);
      await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.DIALOG_LINE, { speaker: 'pudding', text: 'ROOOAAR. (Is that... milk?)' }); });
      await t.wait(600);
      await t.G(() => { const g = window.__GAME__; g.ctx.bus.emit(g.E.DIALOG_END, { id: 'cs03' }); });
      await t.wait(700);
      const s4 = await st(t);
      t.assert(s4.duckNow > 0.85 && (s4.started.babble ?? 0) > (s.started.babble ?? 0), `after the dialogue: duck ${s4.duckNow}, blips ${(s4.started.babble ?? 0) - (s.started.babble ?? 0)}`);
      // hitstop duck (30 ms): the render sees the rising edge, schedules the dip and the recovery on the audio clock
      const hd = await t.page.evaluate(() => new Promise((res) => {
        const g = window.__GAME__, a = g.ctx.audio, ac = a.ac, prm = a.bus.hitDuck.gain;
        g.game.requestHitstop(0.1);
        let min = 1, frames = 0, at = 0;
        const t0 = performance.now();
        const f = () => {
          min = Math.min(min, prm.value); frames++;
          if (!at && a._hs) at = ac.currentTime;
          if (frames < 8 || performance.now() - t0 < 400) requestAnimationFrame(f);
          else setTimeout(() => res({ min, end: prm.value, at, now: ac.currentTime }), 500);
        };
        requestAnimationFrame(f);
      }));
      t.assert(hd.at > 0, 'hitstop rising edge not seen by audio render');
      if (!(hd.min < 0.9)) t.warn(`hitstop dip not sampled (min ${hd.min.toFixed(2)}; frames too slow to catch 30 ms)`);
      t.assert(hd.end > 0.95, `music recovered after the hitstop duck (${hd.end.toFixed(2)}, ${(hd.now - hd.at).toFixed(2)} s later)`);
      // pause menu: the world quietens, music ducks
      await t.setMode('menu');
      await t.wait(400);
      const s5 = await st(t);
      t.assert(s5.duck === 0.5, `menu duck ${s5.duck}`);
      await t.setMode('play');
      // voice limits (§16.5): 8 × 2D, 12 × 3D, the oldest stolen
      const v = await t.page.evaluate(async () => {
        const g = window.__GAME__, a = g.ctx.audio, p = g.ctx.player.pos;
        await a.decode('creature/rat_squeak_attack');
        for (let i = 0; i < 30; i++) { a._gates.clear(); a.play3D('creature/rat_squeak_attack', new g.THREE.Vector3(p.x + (i % 6), 0, p.z + 3), { volume: 0.2 }); }
        for (let i = 0; i < 20; i++) { a._gates.clear(); a.play2D('creature/rat_squeak_attack', { volume: 0.1 }); }
        const s = a.debugState();
        a.stopAll(0.05);
        return { v2: s.voices2D, v3: s.voices3D };
      });
      t.assert(v.v2 <= 8 && v.v3 <= 12 && v.v3 >= 10, `voice pools ${v.v2}/8 2D, ${v.v3}/12 3D`);
    },
  },
  {
    name: 'audio:cues', order: 86, level: 'meadow', spawn: 'start', timeout: 120000,
    async run(t) {
      if (!(await unlock(t))) return;
      await t.G(() => window.__GAME__.ctx.audio.showMeter(true));
      // the §5.4 audio columns of CS-00…CS-03 as the story's `sfx` / `music` steps will issue them (ids, anchors, rates)
      const r = await t.page.evaluate(async () => {
        const g = window.__GAME__, a = g.ctx.audio, E = g.E, bus = g.ctx.bus;
        const wait = (ms) => new Promise((res) => setTimeout(res, ms));
        const log = [];
        const step = (kind, ...args) => { a._gates.clear(); const h = kind === 'music' ? a.music(...args) : kind === '3d' ? a.play3D(...args) : a.play2D(...args); log.push(`${kind}:${args[0]}`); return h; };
        const preload = ['ui/drop_001', 'ui/drop_002', 'world/creak1', 'sword/sword_unsheathe', 'sword/sword_unsheathe2', 'impact/armor_light',
          'impact/cloth', 'impact/cloth_heavy', 'cat/cat_purrsleepy_loop', 'pickup/bubble2', 'creature/creature_roar_02', 'creature/c80_roar_01',
          'creature/creature_roar_01', 'creature/c80_monster_01', 'impact/impactSoft_heavy_002', 'creature/animal_moo'];
        await Promise.all(preload.map((p) => a.decode(p)));
        // CS-00: the title track (fades in over 2 s after the unlock)
        step('music', 'title', 2);
        await wait(300);
        // CS-01: stamps, purr, creak, unsheathe, armour, cloth
        g.game.setMode('cutscene'); bus.emit(E.CUTSCENE_START, { id: 'cs01' });
        for (const id of ['ui/drop_001', 'ui/drop_002', 'world/creak1', 'sword/sword_unsheathe', 'impact/armor_light', 'impact/cloth']) { step('2d', id); await wait(120); }
        // shot 5: the purr as a looping, followed sound outside the voice pools; the cutscene stops its handle
        const purr = step('3d', 'cat/cat_purrsleepy_loop', 'swordcat', { vol: 0.6, loop: true });
        await wait(250);
        const purrLooping = !!purr && a.loops.has(purr) && !!purr.src?.loop && purr.follow === g.ctx.player;
        purr?.stop(0.3);
        bus.emit(E.CUTSCENE_END, { id: 'cs01', skipped: false }); g.game.setMode('play');
        // tutorial: the sleeping cow moos
        step('3d', 'creature/animal_moo', g.ctx.player.pos.clone().add(new g.THREE.Vector3(6, 0, 0)), { vol: 0.9 });
        // CS-02: far drums at rate 0.6, the damped Sunbell clunk, the laugh chorus, the march, cloth / unsheathe, the battle sting
        g.game.setMode('cutscene'); bus.emit(E.CUTSCENE_START, { id: 'cs02' });
        step('2d', 'creature/c80_monster_0x', { rate: 0.6 });
        step('2d', 'bellClunk');
        step('3d', 'laughChorus', 'swordcat', { count: 6, r: 18, dur: 2 });
        step('3d', 'march', 'swordcat', { on: true });
        await wait(900);
        step('2d', 'impact/cloth_heavy'); step('2d', 'sword/sword_unsheathe2');
        step('music', null, 0.5);                                         // shot 7: music none, wind only
        step('3d', 'laugh', 'swordcat', { rate: 0.85 });                 // Cacklejaw
        step('music', 'battle_theme_a', 0.3);                             // shot 13 sting
        await wait(700);
        const mid = a.debugState();
        step('3d', 'march', 'swordcat', { on: false });
        bus.emit(E.CUTSCENE_END, { id: 'cs02', skipped: false }); g.game.setMode('play');
        // CS-03: music none, sip, rumble, whip-fall cloth, the roar pair, one roar per Pudding line, then the glade fight loop
        g.game.setMode('cutscene'); bus.emit(E.CUTSCENE_START, { id: 'cs03' });
        step('music', null, 0.8);
        step('3d', 'pickup/bubble2', 'swordcat');
        step('2d', 'impact/impactSoft_heavy_00x');
        step('2d', 'impact/cloth_heavy');
        step('2d', 'creature/creature_roar_02'); step('2d', 'creature/c80_roar_01', { rate: 0.8 });
        bus.emit(E.DIALOG_LINE, { speaker: 'pudding', text: 'ROOOAAR. (Is that... milk?)' });
        await wait(400);
        step('music', 'battle_fast_fight_loop', 0.5);                    // end block
        bus.emit(E.DIALOG_END, { id: 'cs03' });
        bus.emit(E.CUTSCENE_END, { id: 'cs03', skipped: false }); g.game.setMode('play');
        await wait(300);
        const end = a.debugState();
        return { log, purrLooping, purrGone: !a.loops.has(purr), mid: { director: mid.director, chorus: mid.chorus, marching: mid.marching, bells: mid.bells }, end: { director: end.director, started: end.started, music: end.music } };
      });
      const s = r.end.started;
      const need = ['ui/drop_001', 'ui/drop_002', 'world/creak1', 'sword/sword_unsheathe', 'impact/armor_light', 'impact/cloth', 'cat/cat_purrsleepy_loop',
        'creature/animal_moo', 'creature/c80_monster_0x', 'impact/cloth_heavy', 'sword/sword_unsheathe2', 'pickup/bubble2', 'impact/impactSoft_heavy_00x',
        'creature/creature_roar_02', 'creature/c80_roar_01'];
      const silent = need.filter((k) => !(s[k] > 0));
      t.assert(silent.length === 0, `cue sheet sounds that did not start: ${silent.join(', ')}`);
      t.assert(r.purrLooping && r.purrGone, `CS-01 purr loop: looping ${r.purrLooping}, stopped ${r.purrGone}`);
      t.assert(r.mid.chorus === 6 && r.mid.marching && r.mid.bells >= 1, `CS-02 layers: chorus ${r.mid.chorus}, march ${r.mid.marching}, bells ${r.mid.bells}`);
      t.assert(r.mid.director.target === 'battle_theme_a', `CS-02 sting track ${r.mid.director.target}`);
      t.assert(r.end.director.target === 'battle_fast_fight_loop' && r.end.director.combat, `CS-03 end: ${JSON.stringify(r.end.director)}`);
      t.assert((s.babble ?? 0) >= 1, 'Pudding babble roar');
      t.log(`${r.log.length} cues; end deck ${r.end.music.decks.map((d) => `${d.track ?? '-'}@${d.gain}`).join(' | ')}`);
      await shot(t, '08-cs03-glade-music');
      // back to explore for the next blocks
      await t.G(() => { const a = window.__GAME__.ctx.audio; a.stopAll(0.1); a.music('field_of_dreams', 0.5); a.director.combat = false; a.director.forced = null; });
    },
  },
];
