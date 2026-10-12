// src/story/cutscenes/cs00.js  (owner: story) — CS-00 Title Loop (GAME_DESIGN §5.4; WA §4.3, ON §3) [MVP].
// `meadow` spawn `title` (the sunny practice field by the north gate), `meadow_morning` with fog 0.035, wind 1.0.
// Swordcat in the Oath pose with the bow on and — on a new save — the RED cape (the poster look is the first thing
// anyone sees); afterwards her equipped cape. Pearl bounces 1.4 m to her left (a `jump` every 2.6 s, offset 0.3 s from
// the holy pulse, 6 pink hearts per hop) and stays for Morning Practice. MEME_LOOP, looping every 3.8 s; every second
// loop a holy pulse 0 → 0.35 → 0 over 1.2 s with 40 sparkles. The logo pops in at 1.0 s; the press prompt follows once
// `game.playReady` is true (PERF S2t: masked by the logo). Silent until the first input unlocks audio.
// The loop never ends by itself: StoryManager ends it when a new game / continue is chosen (or a test skips it). A new
// game ends it normally, so the camera blends MEME_LOOP → follow over TITLE_BLEND s (no cut, no reload; WA §6.3).
import { PLAYER, FADE_COLOR } from '../../core/config.js';
import { capeOverride, memeLook } from './rig.js';

const LOOP = PLAYER.memeCam.loop;
/** §5.4: holy 0 → 0.35 → 0 over 1.2 s with 40 sparkles, every second 3.8 s loop. */
export const TITLE_PULSE = Object.freeze({ peak: 0.35, dur: 1.2, sparkles: 40, every: 2 });
/** ON §3.1: Pearl beside her on the title (m to her left), her hop period and offset from the pulse, hearts per hop. */
export const TITLE_PEARL = Object.freeze({ side: 1.4, every: 2.6, offset: 0.3, hearts: 6, color: '#FF8FB1' });
/** WA §6.3: the camera blend from the title loop to the iso follow rig after the tap (s, inOutSine). */
export const TITLE_BLEND = 1.1;
/** Seconds after the logo before the press prompt may show (and the max wait for `game.playReady`). */
export const TITLE_TIMING = Object.freeze({ logoAt: 1.0, pressAt: 0.4, readyMax: 6 });

/** Holy level of the title pulse at title time `t` (0 outside the pulse). Pure. */
export function titlePulse(t, loop = LOOP, P = TITLE_PULSE) {
  const n = Math.floor(t / loop), u = t - n * loop;
  if (n % P.every !== P.every - 1 || u >= P.dur) return 0;
  return P.peak * Math.sin(Math.PI * (u / P.dur));
}

/** Does Pearl hop between title times a and b? (every TITLE_PEARL.every s, starting at `offset`). Pure. */
export function pearlHops(a, b, P = TITLE_PEARL) {
  const k = (t) => Math.floor((t - P.offset) / P.every);
  return b >= P.offset && k(b) !== k(a);
}

/** Is the game ready to play (PERF S2t)? `game.playReady` may be missing (true), a boolean, or a promise-like flag. */
export function playReady(ctx) {
  const r = ctx?.game?.playReady;
  if (r === undefined || r === null) return true;
  if (typeof r === 'boolean') return r;
  if (typeof r === 'function') { try { return !!r(); } catch { return true; } }
  return !!r.done || !!r.ready;
}

/** Her left in world XZ for a facing yaw (models face +Z; +X local is her left). Pure. */
export function leftOf(pos, facing, d) {
  return [pos.x + Math.cos(facing) * d, pos.z - Math.sin(facing) * d];
}

function titleSetup(ctx, cs) {
  cs.host?.titleBegin?.();
  const p = ctx.player;
  if (!ctx.state?.getFlag?.('prologue.armour')) capeOverride(ctx, 'red');
  memeLook(ctx, true);
  if (p) cs.holyActors.add(p);
  // Pearl, the practice guide, already there on the title (one extra skinned actor she needs in play anyway)
  if (p) {
    const [x, z] = leftOf(p.pos, p.facing ?? 0, TITLE_PEARL.side);
    cs.spawnOne({ id: 'pearl', type: 'npc', at: [x, z], facing: p.facing ?? 0, keep: true });
  }
  let t = 0, last = -1, lit = false;
  cs.every((dt) => {
    const t0 = t;
    t += dt;
    const h = titlePulse(t);
    const n = Math.floor(t / LOOP);
    if (h > 0) {
      ctx.fx?.holy?.(p, h);
      lit = true;
      if (n !== last) { last = n; ctx.fx?.burst?.('sparkle', p, { count: TITLE_PULSE.sparkles, color: '#FFF1C4' }); }
    } else if (lit) { lit = false; ctx.fx?.holy?.(p, 0); }
    if (pearlHops(t0, t)) {
      const pearl = cs.actor('pearl');
      if (pearl) {
        pearl.play?.('jump', { once: true });
        ctx.fx?.burst?.('heart', pearl, { count: TITLE_PEARL.hearts, color: TITLE_PEARL.color });
      }
    }
  });
}

function titleEnd(ctx, cs, skipped, phase) {
  if (phase !== 'before') return;
  capeOverride(ctx, null);
  memeLook(ctx, false);
  const pearl = cs.actor('pearl');
  if (pearl) { try { pearl.setScripted?.(true); pearl.pose?.('idle'); } catch { /* gone */ } }
}

export default {
  id: 'cs00', kind: 'cutscene', skippable: false, letterbox: false, prologue: true,
  steps: [
    { t: 'ui', letterbox: false, hud: false, fade: { to: FADE_COLOR, alpha: 0, dur: 0.8 } },
    { t: 'actor', id: 'swordcat', at: 'title', pose: 'oath' },
    { t: 'env', preset: 'meadow_morning', fogDensity: 0.035, wind: 1.0 },
    { t: 'cam', preset: 'MEME_LOOP', anchor: 'swordcat', mode: 'cut' },
    { t: 'call', fn: titleSetup },
    { t: 'wait', dur: TITLE_TIMING.logoAt },
    { t: 'ui', title: { text: 'game.title', sub: 'game.subtitle', logo: true } },
    { t: 'wait', dur: TITLE_TIMING.pressAt },
    { t: 'wait', until: (ctx) => playReady(ctx), max: TITLE_TIMING.readyMax },
    { t: 'call', fn: (ctx, cs) => cs.host?.titlePressReady?.() },
    { t: 'ui', press: 'title.prompt' },
    { t: 'wait', until: (ctx, cs) => !!cs.host?.titleDone, max: Infinity },
  ],
  end: {
    ui: { title: null, press: false },
    call: titleEnd,
    keep: ['pearl'],
    actors: { swordcat: { pose: null } },
    cam: { mode: 'follow', blend: TITLE_BLEND, ease: 'inOutSine' },
  },
};
