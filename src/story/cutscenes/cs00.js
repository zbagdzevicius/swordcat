// src/story/cutscenes/cs00.js  (owner: story) — CS-00 Title Loop (GAME_DESIGN §5.4) [MVP].
// `meadow` spawn `title` (the practice-field north gate), `meadow_day` with fog 0.05, wind 1.6. Swordcat in the Oath
// pose with the bow on and — on a new save — the RED cape (the ref2 poster look is the first thing anyone sees);
// afterwards her equipped cape. MEME_LOOP, looping every 3.8 s; every second loop a holy pulse 0 → 0.35 → 0 over
// 1.2 s with 40 sparkles. The SWORDCAT logo (pink bow on the O) fades in at 1.5 s, then "Press any key / Tap to
// start". Silent until the first input unlocks audio (story then fades in `village_bards_tale` over 2 s).
// The loop never ends by itself: StoryManager ends it when a new game / continue is chosen (or a test skips it).
import { PLAYER } from '../../core/config.js';
import { capeOverride, memeLook } from './rig.js';

const LOOP = PLAYER.memeCam.loop;
/** §5.4: holy 0 → 0.35 → 0 over 1.2 s with 40 sparkles, every second 3.8 s loop. */
export const TITLE_PULSE = Object.freeze({ peak: 0.35, dur: 1.2, sparkles: 40, every: 2 });

/** Holy level of the title pulse at title time `t` (0 outside the pulse). Pure. */
export function titlePulse(t, loop = LOOP, P = TITLE_PULSE) {
  const n = Math.floor(t / loop), u = t - n * loop;
  if (n % P.every !== P.every - 1 || u >= P.dur) return 0;
  return P.peak * Math.sin(Math.PI * (u / P.dur));
}

function titleSetup(ctx, cs) {
  cs.host?.titleBegin?.();
  const p = ctx.player;
  if (!ctx.state?.getFlag?.('prologue.armour')) capeOverride(ctx, 'red');
  memeLook(ctx, true);
  if (p) cs.holyActors.add(p);
  let t = 0, last = -1, lit = false;
  cs.every((dt) => {
    t += dt;
    const h = titlePulse(t);
    const n = Math.floor(t / LOOP);
    if (h > 0) {
      ctx.fx?.holy?.(p, h);
      lit = true;
      if (n !== last) { last = n; ctx.fx?.burst?.('sparkle', p, { count: TITLE_PULSE.sparkles, color: '#FFE3A3' }); }
    } else if (lit) { lit = false; ctx.fx?.holy?.(p, 0); }
  });
}

function titleEnd(ctx, cs, skipped, phase) {
  if (phase !== 'before') return;
  capeOverride(ctx, null);
  memeLook(ctx, false);
}

export default {
  id: 'cs00', kind: 'cutscene', skippable: false, letterbox: false, prologue: true,
  steps: [
    { t: 'ui', letterbox: false, hud: false, fade: { to: '#000', alpha: 0, dur: 0.8 } },
    { t: 'actor', id: 'swordcat', at: 'title', pose: 'oath' },
    { t: 'env', preset: 'meadow_day', fogDensity: 0.05, wind: 1.6 },
    { t: 'cam', preset: 'MEME_LOOP', anchor: 'swordcat', mode: 'cut' },
    { t: 'call', fn: titleSetup },
    { t: 'wait', dur: 1.5 },
    { t: 'ui', title: { text: 'game.title', sub: 'game.subtitle', logo: true } },
    { t: 'wait', dur: 1.4 },
    { t: 'ui', press: 'title.prompt' },
    { t: 'wait', until: (ctx, cs) => !!cs.host?.titleDone, max: Infinity },
  ],
  end: { ui: { title: null, press: false }, call: titleEnd, cam: 'follow' },
};
