// tests/smoke/art.mjs  (owner: core) — ART_WARM_SPEC §11.1 smoke block `art:toon` (A:core.7): the numeric look gates
// through `__GAME__.art.*` (core debug.js), per level preset at the start spawn, iso camera, the active quality,
// 1280 × 720. Gates that need a later stage's surface (characters' debugFeatures for G14, world's art.shadowProbe for
// G6) report "n/a" until their owner lands it. Screenshots: tests/shots/art/<preset>.png (Read them: ART S1 / S2).
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'art';
/** level, spawn, preset, night/keep relaxations (§11.1 G1–G5). */
const ROWS = [
  { level: 'meadow', preset: 'meadow_day' },
  { level: 'forest', preset: 'forest_day' },
  { level: 'forest', preset: 'forest_twilight', night: true },
  { level: 'town', preset: 'town_occupied' },
  { level: 'town', preset: 'hub_gold' },
  { level: 'town', preset: 'hub_hush' },
  { level: 'gate', preset: 'gate_dusk' },
  { level: 'bog', preset: 'bog_dusk', bog: true },
  { level: 'keep', preset: 'keep_storm', night: true },
];

/** ART §11.1 G1–G5 bands. */
export function artBands(row) {
  const n = !!row.night;
  return {
    luma: n ? [0.32, 1] : [0.48, 0.60],
    chroma: n ? [0.12, 1] : [0.16, 0.26],
    warmth: row.bog ? [-0.02, 1] : n ? [0, 1] : [0.06, 0.16],
    dark: n ? 0.20 : 0.08,
    black: 0.005,
  };
}

const inBand = (v, [a, b]) => v >= a && v <= b;

export default [
  {
    name: 'art:toon', order: 70, level: null, timeout: 600000,
    async run(t) {
      fs.mkdirSync(path.join(t.shotsDir, DIR), { recursive: true });
      // G12: the toon patch installed (no [toon] warning: installToon reports false on drift)
      const toon = await t.G(() => { const C = window.__GAME__.THREE.ShaderChunk; return ['lights_pars_begin', 'lights_lambert_pars_fragment', 'lights_fragment_begin', 'opaque_fragment'].every((k) => /toon/i.test(C[k])); });
      t.assert(toon, 'G12: core/toon.js did not patch every TOON_KEYS chunk');
      // G17: no medieval font files requested during boot
      const fonts = await t.page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /uncial|medievalsharp|cinzel/i.test(n)));
      t.assert(fonts.length === 0, `G17: medieval font requests ${fonts.join(', ')}`);
      let lastLevel = null;
      for (const row of ROWS) {
        if (row.level !== lastLevel) {
          await t.loadLevel(row.level, 'start');
          await t.G(() => { const g = window.__GAME__; g.story.skip?.(); g.skipDialog?.(); g.setMode('play'); g.god(true); });
          lastLevel = row.level;
        }
        await t.G((p) => window.__GAME__.ctx.env.preset(p, 0), row.preset);
        await t.frames(30);
        const s = await t.G(() => window.__GAME__.art.frameStats({ exclude: 'actors' }));
        const all = await t.G(() => window.__GAME__.art.frameStats());
        const hero = await t.G(() => window.__GAME__.art.heroChroma());
        const comp = await t.G(() => window.__GAME__.art.composerActive);
        const p = await t.G(() => window.__GAME__.perf());
        await t.shot(`${DIR}/${row.preset}`);
        const B = artBands(row), tag = `${row.preset}`;
        t.log(`${tag}: luma ${all.luma.toFixed(3)} chroma ${all.chroma.toFixed(3)} R−B ${all.warmth.toFixed(3)} dark ${(all.dark * 100).toFixed(1)}% black(no actors) ${(s.black * 100).toFixed(2)}% hero ${hero?.hero.toFixed(3)} / ground ${hero?.ground.toFixed(3)} calls ${p.calls} [${p.stage}]`);
        t.assert(inBand(all.luma, B.luma), `G1 ${tag}: luma ${all.luma.toFixed(3)} outside ${B.luma}`);
        t.assert(inBand(all.chroma, B.chroma), `G2 ${tag}: chroma ${all.chroma.toFixed(3)} outside ${B.chroma}`);
        t.assert(inBand(all.warmth, B.warmth), `G3 ${tag}: R−B ${all.warmth.toFixed(3)} outside ${B.warmth}`);
        t.assert(all.dark <= B.dark, `G4 ${tag}: dark ${(all.dark * 100).toFixed(1)} % > ${B.dark * 100} %`);
        t.assert(s.black < B.black, `G5 ${tag}: black ${(s.black * 100).toFixed(2)} % ≥ 0.5 % (actors excluded)`);
        if (hero && hero.heroN > 4) t.assert(hero.hero >= 1.3 * hero.ground, `G8 ${tag}: hero chroma ${hero.hero.toFixed(3)} < 1.3 × ground ${hero.ground.toFixed(3)}`);
        const cap = p.budget.frameCalls ?? p.budget.sceneCalls;
        t.assert((p.budget.frameCalls != null ? p.calls : p.sceneCalls) <= cap, `G9 ${tag}: ${p.calls} calls > ${cap} (${p.stage})`);
        const q = p.quality;
        t.assert(!comp || q === 'high', `G13 ${tag}: post chain active in play on ${q}`);
      }
      // G6 (Med): coloured shadows at the level's probe, when world authored one
      await t.loadLevel('meadow', 'start');
      const ratio = await t.G(() => window.__GAME__.art.shadowRatio());
      if (ratio == null) t.log('G6: n/a (no level art.shadowProbe yet)'); else t.assert(ratio >= 0.45, `G6: shadowRatio ${ratio.toFixed(2)} < 0.45`);
      // G13 in a cutscene on Low / Med: no composer
      const cut = await t.page.evaluate(() => new Promise((res) => {
        const g = window.__GAME__, pf = g.ctx.postfx; let on = 0, n = 0;
        g.setMode('cutscene'); pf.setCinematic(true);
        const off = g.game.addFrameHook(() => { n++; if (pf.composerActive) on++; if (n >= 20) { off(); pf.setCinematic(false); g.setMode('play'); res({ on, q: pf.qualityName }); } });
      }));
      t.assert(cut.q === 'high' || cut.on === 0, `G13: ${cut.q} ran the composer in a cutscene (${cut.on} frames)`);
      // G14: phone face sizes need characters' debugFeatures (report until it lands)
      const eye = await t.G(() => window.__GAME__.art.featurePx('eyeL'));
      t.log(eye ? `G14 (desktop): eyeL ${eye.w.toFixed(1)}×${eye.h.toFixed(1)} px` : 'G14: n/a (characters debugFeatures() not exposed yet)');
    },
  },
];
