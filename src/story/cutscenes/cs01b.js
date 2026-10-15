// src/story/cutscenes/cs01b.js  (owner: story) — CS-01b "Suit Up" (WA §8.4, ON §5.4) [MVP], TT2 §10.3: a ≤ 6-s inline
// beat (measured 3.8 s in the browser, sceneLength 3.7 s; ≤ ONBOARD.sceneCap.cs01b). After the first fight the Pink Paw trail leads her to
// Marmalade's barn chest (world's `barn_chest` interactable, tag "Open"; StoryManager's director plays it by proximity
// when the level has none): she kneels, the chest opens, a cream blink — armour on, "CLANK!" — "...Borrowing this."
// No letterbox, no mirror, no helmet gag any more; skippable from second 0 (the Skip chip).
// end: flags prologue.armour / prologue.tutorial / prologue.done (the north gate opens); armour on; `meadow_day`; the
// Chapter 1 card; the `knight` friend-size reward after it; save. When the level cannot switch its Chapter 1 zones on
// live (`level.refresh`), a cream wipe covers a quick reload at the barn door.
import { FADE_COLOR } from '../../core/config.js';
import { reward } from '../rewards.js';
import { setTimeoutish } from '../tutorial.js';
import { say, cam, wait, sfx } from './lib.js';
import { outfit, buildSunPatch } from './rig.js';

/** The barn set (in front of Marmalade's armoury barn door, `barn_door` (−14, −88.6)). */
/** Seconds after the hand-off before the "Knight-ish!" friend card: the chapter card (3 s) + a breath. */
export const FRIEND_AFTER_CARD = 3.4;

export const BARN = Object.freeze({ clem: [-13.3, -87.4], chest: [-12.85, -88.75], helm: [-13.85, -87.0], mirror: [-13.1, -85.05], enter: [-11.7, -85.0] });
/** Seconds of the closing cream wipe (ON §5.4). */
export const SUIT_WIPE = 0.3;
/** The measured length of the beat (s; tests compare sceneLength against ONBOARD.sceneCap.cs01b). */
export const CS01B_LEN = 3.8;

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
  id: 'cs01b', kind: 'cutscene', skippable: true, prologue: true, letterbox: false, once: true,
  steps: [
    { t: 'ui', letterbox: false, hud: false },
    { t: 'if', cond: (ctx) => !levelChest(ctx), then: [
      { t: 'spawn', id: 'chest', asset: 'models/env/dungeon-mini/chest.glb', fit: { x: 0.7 }, at: BARN.chest, facing: 0.1 },
    ] },
    { t: 'spawn', id: 'sunbeam', build: buildSunPatch, at: BARN.chest, y: 0.05 },
    { t: 'actor', id: 'swordcat', face: 'chest', faceDur: 0.2, expression: 'earnest' },
    // TT4: a more frontal three-quarter (from 1.35 m to the side her far eye sat behind her cheek fur, only its
    // catchlights showing: it read as a blank white eye)
    cam(null, 'swordcat', { pos: [0.75, 0.95, 1.9], look: [0, 0.55, -0.2], fov: 40 }),
    { t: 'actor', id: 'swordcat', pose: 'kneel' },
    sfx('world/creak1', BARN.chest, { vol: 0.9 }),
    { t: 'call', fn: (ctx, cs) => { cs.spawned.find((r) => r.id === 'chest')?.anim?.play?.('open', { once: true, clampEnd: true }); } },
    { t: 'fx', burst: 'sparkle', at: BARN.chest, count: 10, color: '#FFD57A' },
    wait(0.6),
    // ---- a cream blink: armour on, CLANK!
    { t: 'ui', fade: { to: FADE_COLOR, alpha: 1, dur: 0.15 } },
    wait(0.18),
    { t: 'call', fn: (ctx) => outfit(ctx, 'armour') },
    { t: 'actor', id: 'swordcat', pose: 'idle', expression: 'happy' },
    { t: 'ui', fade: { alpha: 0, dur: 0.15 } },
    sfx('impact/armor_light', 'swordcat', { vol: 1 }),
    { t: 'call', fn: (ctx) => { const p = ctx.player; if (p) ctx.fx?.damageNumber?.({ x: p.pos.x, y: p.pos.y + 1.3, z: p.pos.z }, 'CLANK!', 'pop'); } },
    wait(0.3),
    say('swordcat', 'cs01.10', 1.6, { expression: 'happy' }),
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
      // the friend card waits for the Chapter 1 card (StoryManager CARD.dur 3 s) so the two never stack (WA §8.4 order)
      setTimeoutish(ctx, FRIEND_AFTER_CARD, () => reward(ctx, 'friend', 'knight'));
    },
    ui: { letterbox: false, hud: true, fade: { alpha: 0, dur: SUIT_WIPE } },
    chapter: 1,
    cam: 'follow',
    save: true,
  },
};
