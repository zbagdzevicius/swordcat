// src/story/cutscenes/cs05.js  (owner: story) — CS-05 First Light (GAME_DESIGN §5.4) [MVP], ~15 s.
// `forest` Cheese Mill: played by StoryManager on boss:defeated {boss_grizzlechop}. The beaten captain stays in the
// scene (castBoss scripts the real boss and stops his death shrink; an AI-less stand-in if he is already gone).
//   1 TWO_SHOT_LOW: his hat flies off. "I yield! I YIELD! Mind the cheese!"
//   2 a glowing shard rises from his cheese shield: "Take the shiny rock! …we expected to be... bigger."
//   3 HERO_LOW: she raises the sword and the shard sinks into the blade (holy 0 → 1 over 1.5 s, 80 sparkles,
//     fog −0.01 for 3 s); powerup_rise05 then magic1. Toast "Holy Slash learned! …"
//   4 "The cages went to Pawsbury. The Legion holds the whole town!"  Clem: "Then I'm going home."
// end: state.shards = 1; flag forest.boss (world's mill exit opens on it).
import { E } from '../../core/events.js';
import { say, cam, wait, sfx, par } from './lib.js';
import { castBoss, buildShard, animateBuilt, flyObject, built } from './cast.js';

/** Where the captain kneels when there is no boss to borrow (the mill arena centre, §12.4). */
const MILL = [-10, 84];

function stage(ctx, cs) {
  const g = castBoss(ctx, cs, { key: 'grizzlechop', id: 'grizzlechop', standIn: 'grizzlechop', fallback: MILL });
  const me = ctx.player;
  if (!g || !me) return;
  // she stands 2.3 m from him, both facing each other
  const dx = me.pos.x - g.pos.x, dz = me.pos.z - g.pos.z, d = Math.hypot(dx, dz) || 1;
  cs.place(me, [g.pos.x + (dx / d) * 2.3, g.pos.z + (dz / d) * 2.3], Math.atan2(-dx, -dz));
  g.facing = Math.atan2(dx, dz); g.snap?.();
  cs.spawnOne({ id: 'shard', kind: 'object', build: buildShard, at: [g.pos.x, g.pos.y + 0.9, g.pos.z], visible: false });
  const s = built(cs, 'shard');
  if (s) s.visible = false;
  animateBuilt(cs, 'shard');
}

/** The shard rises 1.2 m out of his shield. */
function shardRises(ctx, cs) {
  const s = built(cs, 'shard'), g = cs.actor('grizzlechop');
  if (!s || !g) return null;
  s.visible = true;
  const from = [g.pos.x, g.pos.y + 0.8, g.pos.z], to = [g.pos.x, g.pos.y + 2.0, g.pos.z];
  return flyObject(cs, () => built(cs, 'shard'), from, to, 1.4, 0);
}

/** …then streaks into her raised blade. */
function shardToBlade(ctx, cs) {
  const s = built(cs, 'shard'), me = ctx.player;
  if (!s || !me) return null;
  const from = [s.position.x, s.position.y, s.position.z];
  const to = [me.pos.x + Math.sin(me.facing) * 0.15, me.pos.y + 1.25, me.pos.z + Math.cos(me.facing) * 0.15];
  return flyObject(cs, () => built(cs, 'shard'), from, to, 0.9, 0.6, (u, o) => { if (o && u >= 1) o.visible = false; });
}

const toastOnce = (ctx, cs) => {
  if (cs._toasted) return;
  cs._toasted = true;
  ctx.bus.emit(E.TOAST, { text: cs.text('toast.holy'), key: 'toast.holy', icon: 'shard' });
};

export default {
  id: 'cs05', kind: 'cutscene', skippable: true,
  steps: [
    { t: 'ui', letterbox: true, hud: false },
    { t: 'music', track: null, fade: 1.2 },
    { t: 'call', fn: stage },
    { t: 'actor', id: 'grizzlechop', pose: 'kneel', expression: 'surprised' },
    { t: 'actor', id: 'swordcat', pose: 'idle', expression: 'determined' },

    // ---- 1 · "I yield!"
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'grizzlechop', pos: [1.9, 0.8, 1.7], fov: 40, lookMid: 0.9 }),
    { t: 'fx', burst: 'helmet', at: 'grizzlechop' },
    sfx('cs05.hatFly', 'grizzlechop'),
    sfx('cs05.yield', 'grizzlechop'),
    say('grizzlechop', 'cs05.1', 2.4),

    // ---- 2 · the shard rises from the cheese shield
    sfx('cs05.shardRise', 'grizzlechop'),
    { t: 'call', fn: shardRises, max: 3 },
    say('grizzlechop', 'cs05.2', 6.6),

    // ---- 3 · HERO_LOW: into the blade
    cam('HERO_LOW', 'swordcat'),
    { t: 'actor', id: 'swordcat', pose: 'oath', expression: 'earnest' },
    sfx('cs05.shardSink', 'swordcat'),
    { t: 'call', fn: shardToBlade, max: 2 },
    par(
      { t: 'actor', id: 'swordcat', holy: [0, 0.6, 0.3], dur: 1.5 },          // (integration: 0.85 / 0.6 bloom washed her face out at night)
      { t: 'fx', burst: 'sparkle', at: 'swordcat', count: 80, color: '#FFE3A3' },
      { t: 'fx', bloomSpike: 0.35, bloomDur: 1.0 },
      { t: 'env', contribute: { cs05: { fogAdd: -0.01 } } },
    ),
    { t: 'call', fn: toastOnce },
    { t: 'actor', id: 'swordcat', expression: 'happy' },
    wait(1.4),
    { t: 'env', contribute: { cs05: null } },

    // ---- 4 · "Then I'm going home."
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'grizzlechop', pos: [-1.8, 0.85, 1.8], fov: 40, lookMid: 0.9 }),
    { t: 'actor', id: 'swordcat', pose: 'idle' },
    say('grizzlechop', 'cs05.3', 3.6),
    { t: 'actor', id: 'swordcat', expression: 'determined' },
    say('swordcat', 'cs05.4', 2.0),

    // ---- 5 · bonk, then befriend (WA §8.1): milk for the cheese; monocle polish, salute
    { t: 'actor', id: 'swordcat', prop: 'milk_cup', expression: 'happy' },
    say('swordcat', 'cs05.5', 1.8),
    { t: 'actor', id: 'grizzlechop', expression: 'happy', emote: 'blink' },
    say('grizzlechop', 'cs05.6', 2.4),
    { t: 'actor', id: 'grizzlechop', clip: 'Yes', nowait: true },
    { t: 'fx', burst: 'heart', at: 'grizzlechop', count: 5, color: '#FF8FB1' },
    { t: 'actor', id: 'swordcat', prop: { milk_cup: false } },
    wait(0.6),
  ],
  end: {
    call: (ctx, cs, skipped, phase) => {
      if (phase !== 'after') return;
      if (skipped) toastOnce(ctx, cs);
      const t = ctx.strings?.t;
      ctx.bus.emit(E.TOAST, { text: t?.('toast.friend', { name: t?.('name.grizzlechop') }) ?? 'toast.friend', key: 'toast.friend' });
    },
    actors: { swordcat: { prop: { milk_cup: false } } },
    flags: { 'forest.boss': true },
    shards: 1,
    env: { contribute: { cs05: null } },
    music: { track: 'field_of_dreams', fade: 2 },
    cam: 'follow',
    save: true,
  },
};
