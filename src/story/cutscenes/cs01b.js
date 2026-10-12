// src/story/cutscenes/cs01b.js  (owner: story) — CS-01b "Suit Up" (WA §8.4, ON §5.4) [MVP], ~18 s.
// After The Giggling Mist she runs (playable, ~12 m) to Marmalade's barn; one warm sunbeam falls on the chest. The chest
// is an interactable (world's barn chest `play: 'cs01b'`; StoryManager's prologue director plays it by proximity when the
// level has none): the player chooses to become the knight. Golden `meadow_evening` light, no lantern, no night:
//   6 the barn door, the chest painted "M. — my first"; she kneels, opens it, lifts the too-big sword
//   7 quick cuts: pauldrons "CLANK!", the helmet falls over her eyes — "Nope." — set aside; the cream cape; the dusty
//     mirror: a tiny knight. "...Borrowing this."
// end: flags prologue.armour / prologue.tutorial / prologue.done (the north gate opens); armour on; `meadow_day`; the
// Chapter 1 card over the barn door; the `knight` friend-size reward; save. No fade to black: a 0.4 s cream wipe. When the
// level cannot switch its Chapter 1 zones on live (`level.refresh`), the wipe covers a quick reload at the barn door.
import { FADE_COLOR } from '../../core/config.js';
import { reward } from '../rewards.js';
import { say, cam, wait, sfx } from './lib.js';
import { outfit, buildMirror, buildSunPatch } from './rig.js';

/** The barn set (in front of Marmalade's armoury barn door, `barn_door` (−14, −88.6)). */
export const BARN = Object.freeze({ clem: [-13.3, -87.4], chest: [-12.85, -88.75], helm: [-13.85, -87.0], mirror: [-13.1, -85.05], enter: [-11.7, -85.0] });
/** Seconds of the closing cream wipe (ON §5.4). */
export const SUIT_WIPE = 0.4;

/** Is the barn chest already in the level (world places it as an interactable)? Then the scene does not spawn its own. */
export function levelChest(ctx) {
  const L = ctx?.levels?.current;
  return (L?.interactables ?? []).find?.((i) => i?.play === 'cs01b' || i?.id === 'barn_chest' || i?.id === 'chest') ?? null;
}

/** Chapter 1 hand-off: the level switches its `prologue.done` zones on live when it can, else a reload at the barn door. */
function chapterOneLoad(ctx, cs, skipped) {
  const L = ctx.levels?.current;
  if (typeof L?.refresh === 'function') {
    try { L.refresh(); } catch (e) { console.warn('[story] level refresh failed', e); }
    try { ctx.audio?.music?.(L.def?.music?.explore ?? 'field_of_dreams', skipped ? 0.5 : 2); } catch { /* audio optional */ }
    return null;
  }
  return { level: 'meadow', spawn: 'practice' };
}

export default {
  id: 'cs01b', kind: 'cutscene', skippable: true, prologue: true, once: true,
  steps: [
    { t: 'ui', letterbox: true, hud: false, fade: { to: FADE_COLOR, alpha: 1, dur: 0.25 } },
    wait(0.3),
    { t: 'env', preset: 'meadow_evening' },
    { t: 'actor', id: 'swordcat', at: BARN.enter, facing: 3.6, pose: 'idle', expression: 'earnest' },
    { t: 'if', cond: (ctx) => !levelChest(ctx), then: [
      { t: 'spawn', id: 'chest', asset: 'models/env/dungeon-mini/chest.glb', fit: { x: 0.7 }, at: BARN.chest, facing: 0.1 },
    ] },
    { t: 'spawn', id: 'sunbeam', build: buildSunPatch, at: BARN.chest, y: 0.05 },
    // the mirror (a Reflector: its program compiles here, under the wipe, not mid-shot)
    { t: 'spawn', id: 'mirror', build: buildMirror, at: BARN.mirror, facing: Math.PI },
    cam(null, 'barn_door', { pos: [2.3, 0.85, 3.4], look: [0.8, 0.55, 0.6], fov: 40 }),
    { t: 'ui', fade: { alpha: 0, dur: 0.6 } },
    { t: 'music', track: 'village_bards_tale', fade: 1.5 },

    // ---- 6 · "M. — my first"
    { t: 'actor', id: 'swordcat', moveTo: BARN.clem, speed: 1.6 },
    { t: 'actor', id: 'swordcat', face: 'chest', faceDur: 0.3 },
    cam(null, 'barn_door', { pos: [1.55, 0.62, 1.55], look: [1.05, 0.38, -0.2], fov: 36, noise: 0.003 }),
    { t: 'actor', id: 'swordcat', pose: 'kneel' },
    sfx('world/creak1', BARN.chest, { vol: 0.9 }),
    { t: 'call', fn: (ctx, cs) => { cs.spawned.find((r) => r.id === 'chest')?.anim?.play?.('open', { once: true, clampEnd: true }); } },
    { t: 'fx', burst: 'sparkle', at: BARN.chest, count: 10, color: '#FFD57A' },
    { t: 'ui', caption: 'cs01.chest' },
    wait(1.8),
    { t: 'ui', caption: null },
    { t: 'actor', id: 'swordcat', pose: 'idle', expression: 'surprised' },
    sfx('sword/sword_unsheathe', 'swordcat', { vol: 0.8 }),
    cam('HERO_LOW', 'swordcat', { pos: [0.9, 0.3, 1.9], fov: 42 }),
    wait(0.9),

    // ---- 7 · CLANK!, the helmet ("Nope."), the cape, the mirror
    { t: 'ui', fade: { to: FADE_COLOR, alpha: 1, dur: 0.15 } },
    wait(0.18),
    { t: 'call', fn: (ctx) => outfit(ctx, 'armour') },
    { t: 'actor', id: 'swordcat', at: [BARN.clem[0] + 0.3, BARN.clem[1] + 1.1], facing: 0, pose: 'idle', expression: 'neutral' },
    cam(null, 'swordcat', { pos: [-0.42, 0.86, 0.42], look: [-0.16, 0.66, 0], fov: 30 }),
    { t: 'ui', fade: { alpha: 0, dur: 0.15 } },
    sfx('impact/armor_light', 'swordcat', { vol: 1 }),
    { t: 'call', fn: (ctx) => { const p = ctx.player; if (p) ctx.fx?.damageNumber?.({ x: p.pos.x, y: p.pos.y + 1.3, z: p.pos.z }, 'CLANK!', 'pop'); } },
    wait(0.3),
    sfx('impact/impactPlate_light_000', 'swordcat', { vol: 0.8 }),
    wait(0.5),
    { t: 'actor', id: 'swordcat', prop: 'helmet', expression: 'surprised' },
    cam(null, 'swordcat', { pos: [0.08, 0.86, 0.95], look: [0, 0.84, 0], fov: 32 }),
    sfx('impact/impactPlate_light_001', 'swordcat', { vol: 0.9 }),
    { t: 'actor', id: 'swordcat', emote: 'shake' },
    wait(0.6),
    { t: 'actor', id: 'swordcat', prop: '-helmet', expression: 'grumpy' },
    { t: 'spawn', id: 'helm', prop: 'helmet', at: BARN.helm, facing: 2.2 },
    say('swordcat', 'cs01.helm', 1.0),
    { t: 'actor', id: 'swordcat', face: 0, faceDur: 0.25, expression: 'determined' },
    cam(null, 'swordcat', { pos: [0.5, 0.95, -1.25], look: [0, 0.62, 0], fov: 40 }),
    sfx('impact/cloth', 'swordcat', { vol: 0.9 }),
    { t: 'env', wind: 1.1, dur: 0.6 },
    wait(1.0),
    { t: 'actor', id: 'swordcat', pose: 'vigil', expression: 'earnest' },
    // over her right shoulder, wide enough that her reflection (a tiny knight) sits beside her head in the glass
    cam(null, 'swordcat', { pos: [-0.72, 0.92, -0.92], look: [-0.12, 0.66, 1.25], fov: 40, mode: 'rail', to: [-0.62, 0.88, -0.78], dur: 3.2, nowait: true }),
    wait(1.2),
    say('swordcat', 'cs01.10', 2.0, { expression: 'happy' }),
    { t: 'ui', fade: { to: FADE_COLOR, alpha: 1, dur: SUIT_WIPE } },
    wait(SUIT_WIPE + 0.05),
  ],
  end: {
    flags: { 'prologue.armour': true, 'prologue.tutorial': true, 'prologue.done': true },
    env: 'meadow_day',
    actors: { swordcat: { prop: { helmet: false } } },
    load: chapterOneLoad,
    player: { spawn: 'barn_door', outfit: 'armour' },
    call: (ctx, cs, skipped, phase) => {
      if (phase === 'before') { cs.host?.barnSet?.(false); return; }
      reward(ctx, 'friend', 'knight');
    },
    ui: { letterbox: false, hud: true, fade: { alpha: 0, dur: SUIT_WIPE } },
    chapter: 1,
    cam: 'follow',
    save: true,
  },
};
