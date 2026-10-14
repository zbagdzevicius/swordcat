// src/story/cutscenes/cs06.js  (owner: story) — CS-06 The Letters (GAME_DESIGN §5.4) [MVP], ~35 s.
// `town` Post Office steps (−36,4), after the Pilfer chase (StoryManager plays it on item:returned {post_bag} /
// objective {chase, done}).
//   1 medium: the mailbag spills open; Sage picks up a letter sealed with the royal paw and reads the summons.
//   2 two-shot: Sage fans out eight identical letters. "Eight of these. None delivered." "They never got them. Nobody
//     came because nobody knew."  Clem: "Then we tell them."
//   3 low: Coo hops onto the bag (Pigeon `Jump`). "Coo." "Every knight. Fast as you can." "Coo." Coo flutters off
//     (Jump + an upward tween over 2 s).
//   4 ECU_EYES: a yellowed envelope; the full-screen parchment card (the ui lore face, Nunito) shows `letter.marmalade`; 4 s of
//     1.5 s of silence, then tavern_old_tower_inn fades in over 2 s (homesick, not mournful; WA §8.6a).
//   5 medium: she folds it and tucks it into her belt.
// end: flag town.letters; the letter rides on her belt (StoryManager re-attaches it after loads until CS-10);
// music back to the level's explore track.
import { say, cam, wait, sfx, yawOf } from './lib.js';
import { castFriend, hideParty, showParty, flyObject, exploreTrack, stepUp } from './cast.js';

/** §12.5: the Post Office (`building_market_blue`) at (−36,4); the bag spills on the street in front of it. */
export const POST = [-36, 4];
export const BAG = [-32.6, 3.2];
const ME = [-31.0, 2.0];
const SAGE = [-32.0, 4.6];
const COO = [-34.4, 1.6];
/** Where Coo lands by the bag, and where Sage steps back to (to Clem's right, behind every Coo lens) to make room. */
const COO_HOP = [BAG[0] - 0.2, BAG[1] - 0.3];
const SAGE_ASIDE = [-30.0, 3.0];
/** Coo's flight: up and away over the Post Office roofs (horizontal unit + run in metres, climb in metres). */
const FLIGHT = [-0.555, 0.832], FLIGHT_RUN = 10.8, FLIGHT_UP = 7;
const FACE_BAG = yawOf([BAG[0] - ME[0], BAG[1] - ME[1]]);

/** Eight summons fanned out on the cobbles around the bag. */
const LETTERS = Array.from({ length: 8 }, (_, i) => {
  const a = -0.9 + (i / 7) * 1.8, r = 0.55 + (i % 2) * 0.12;
  return { t: 'spawn', id: `summons_${i + 1}`, prop: 'letter', at: [BAG[0] + Math.sin(a + FACE_BAG + Math.PI) * r, BAG[1] + Math.cos(a + FACE_BAG + Math.PI) * r],
    y: 0.02, facing: a * 1.3, rx: -Math.PI / 2, visible: false };
});

function cast(ctx, cs) {
  hideParty(ctx, cs, ['sage']);
  castFriend(ctx, cs, 'sage', SAGE, yawOf([BAG[0] - SAGE[0], BAG[1] - SAGE[1]]));
}

/** Show the fanned letters (spawned hidden at the start, so nothing pops while loading). */
function fanOut(ctx, cs) {
  for (const r of cs.spawned) if (r.id.startsWith('summons_') && r.obj) r.obj.visible = true;
}

/** Coo flutters off: up and away over the rooftops in 2 s. */
function cooFliesOff(ctx, cs) {
  const c = cs.actor('coo');
  if (!c) return null;
  c.play?.('hop', {});
  const to = [c.pos.x + FLIGHT[0] * FLIGHT_RUN, c.pos.y + FLIGHT_UP, c.pos.z + FLIGHT[1] * FLIGHT_RUN];
  return flyObject(cs, () => cs.actor('coo'), [c.pos.x, c.pos.y, c.pos.z], to, 2.0, 1.2);
}

export default {
  id: 'cs06', kind: 'cutscene', skippable: true,
  steps: [
    { t: 'ui', letterbox: true, hud: false },
    { t: 'music', track: null, fade: 1.5 },
    { t: 'actor', id: 'swordcat', at: ME, facing: FACE_BAG, pose: 'idle', expression: 'earnest' },
    { t: 'call', fn: cast },
    { t: 'spawn', id: 'bag', prop: 'post_bag', at: BAG, y: 0.02, facing: 0.4, rz: 1.35 },
    ...LETTERS,
    { t: 'spawn', id: 'coo', type: 'coo', at: COO, facing: yawOf([BAG[0] - COO[0], BAG[1] - COO[1]]), visible: false },

    // ---- 1 · Sage reads the royal summons
    cam(null, 'swordcat', { pos: [-1.6, 1.25, 2.6], look: [0.4, 0.45, 1.7], fov: 42 }),
    sfx('cs06.spill', BAG),
    { t: 'actor', id: 'sage', moveTo: [BAG[0] + 0.4, BAG[1] + 0.9], speed: 1.6 },
    { t: 'actor', id: 'sage', face: 'swordcat', faceDur: 0.3, prop: 'letter', expression: 'earnest' },
    sfx('cs06.parchment', 'sage'),
    say('sage', 'cs06.1', 6.0),

    // ---- 2 · eight of them; nobody knew
    { t: 'call', fn: (ctx, cs) => stepUp(ctx, cs, 'sage', 1.4), max: 3 },
    { t: 'actor', id: 'sage', face: 'swordcat', faceDur: 0.3 },
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'sage', pos: [2.2, 0.8, 0.75], fov: 40, lookMid: 0.6 }),
    { t: 'call', fn: fanOut },
    sfx('cs06.fan', BAG),
    { t: 'actor', id: 'sage', emote: 'earsFlat', expression: 'sad' },
    say('sage', 'cs06.2', 2.6),
    say('sage', 'cs06.3', 3.8),
    { t: 'actor', id: 'swordcat', expression: 'determined', emote: 'nod' },
    say('swordcat', 'cs06.4', 2.0),

    // ---- 3 · Coo (Sage steps back to Clem's right as he lands, so no Coo shot looks through her)
    { t: 'actor', id: 'sage', moveTo: SAGE_ASIDE, speed: 1.4, nowait: true },
    { t: 'actor', id: 'coo', visible: true, moveTo: COO_HOP, speed: 1.4 },
    { t: 'actor', id: 'sage', face: COO_HOP, faceDur: 0.3, nowait: true },
    { t: 'actor', id: 'coo', clip: 'hop', once: true },
    cam(null, 'coo', { pos: [0.55, 0.42, 1.5], look: [0, 0.28, 0], fov: 34 }),
    sfx('cs06.coo', 'coo'),
    say('coo', 'cs06.5', 1.0),
    { t: 'actor', id: 'swordcat', face: 'coo', faceDur: 0.3, expression: 'earnest' },
    cam(null, 'swordcat', { pos: [1.9, 0.62, 0.5], look: [-0.1, 0.42, 1.1], fov: 42 }),
    say('swordcat', 'cs06.6', 2.2),
    { t: 'actor', id: 'coo', clip: 'nod', once: true },
    say('coo', 'cs06.7', 1.0),
    // low lens 2.6 m behind his perch, looking up along the flight line (world axes: a point anchor has yaw 0)
    cam(null, COO_HOP, { pos: [-FLIGHT[0] * 2.6, 0.3, -FLIGHT[1] * 2.6], look: [FLIGHT[0] * 2, 1.0, FLIGHT[1] * 2], fov: 48 }),
    sfx('cs06.cooFlutter', 'coo'),
    { t: 'call', fn: cooFliesOff, max: 3 },
    { t: 'actor', id: 'coo', visible: false },

    // ---- 4 · Marmalade's letter: the parchment card, a breath of silence, then the tavern tune
    { t: 'actor', id: 'swordcat', prop: 'letter', expression: 'surprised', face: FACE_BAG, faceDur: 0.3 },
    cam('ECU_EYES', 'swordcat', { mode: 'handheld', noise: 0.002 }),
    wait(1.0),
    { t: 'ui', letter: { key: 'letter.marmalade', title: 'letter.marmalade.title', label: 'letter.card.label' } },
    { t: 'actor', id: 'swordcat', expression: 'glisten' },
    wait(1.5),
    { t: 'music', track: 'tavern_old_tower_inn', fade: 2.0 },
    wait(4.5),
    { t: 'ui', letter: null },
    wait(0.6),

    // ---- 5 · folded into her belt
    cam(null, 'swordcat', { pos: [0.9, 0.85, 1.9], look: [0, 0.55, 0], fov: 40 }),
    { t: 'actor', id: 'swordcat', emote: 'blink', expression: 'earnest' },
    wait(0.8),
    sfx('cs06.fold', 'swordcat'),
    { t: 'actor', id: 'swordcat', prop: { letter: false, 'letter@belt': true } },
    wait(1.6),
  ],
  end: {
    call: (ctx, cs, skipped, phase) => {
      if (phase === 'before') { showParty(cs); cs.host?.cinema?.letter?.(null); }
      else {
        ctx.objectives?.complete?.('chase');
        const t = exploreTrack(ctx);
        try { ctx.audio?.music?.(t, 3); } catch (e) { console.warn(e); }
      }
    },
    flags: { 'town.letters': true },
    actors: { swordcat: { prop: { letter: false, 'letter@belt': true } } },
    cam: 'follow',
    save: true,
  },
};
