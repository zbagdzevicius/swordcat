// src/story/cutscenes/cs09.js  (owner: story) — CS-09 Last Laugh (GAME_DESIGN §5.4) [MVP], ~50 s.
// `gate` causeway: played by StoryManager on boss:defeated {boss_cacklejaw}.
//   1 TWO_SHOT_LOW: Cacklejaw on his knees, hat gone, chipped ear showing; a weak laugh, then a furious one; he points:
//     "Get her! ALL OF YOU! Everybody CHARGE!"
//   2 REVERSE_HORDE: 40 silhouettes charge out of the fog (roar of the crowd).
//   3 HERO_LOW, then an ECU of the blade: she plants the sword (Vigil → Oath); Shard 2 tears out of his belt pouch and
//     sinks into her blade: holy 0 → 1 over 2 s, 160 sparkles, bloom 0.55 → 1.2. THE ref1 FRAME. powerup_rise07 +
//     jingles_STEEL03. Toast "Golden Hour unlocked! At full Valor: [Golden]"
//   4 low, from behind her toward the gatehouse: Pudding rises over it, wings across the frame, and ROARS (roar_03 +
//     c80_roar_02 at 0.7, shake 0.6): "ROOOOAR! (NOT. MY. FRIENDS.)" The horde skids, then scatters into the fog.
//   5 TWO_SHOT_LOW on the empty causeway: he laughs, and it cracks into a sob; she sits beside him.
//     "They used to laugh at me. The runt. So I laughed first. Always first." Clem: "You can stop now. I'll hold it for
//     a bit." (a real, tiny, wheezy laugh) "...You're very strange." Clem: "I know."
//   5b bonk, then befriend (WA §8.1): Clem: "...Hee." — "Did you just... laugh? WITH me?" — "LADS! She laughed WITH
//     me! Best day EVER!" (his plate flips to CHEER-IN-CHIEF through enemies' flipPlate when it exists)
//   6 wide: he bounds off into the haze to tell the lads. Wind.
// end: state.shards = 2; Golden Hour unlocked; flag gate.boss; the Horde despawns; CS-10 follows.
import * as THREE from 'three';
import { say, cam, wait, sfx, par } from './lib.js';
import { castBoss, buildShard, animateBuilt, flyObject, built, clearEnemies, toast } from './cast.js';

/** §12.6 causeway; the gatehouse (Pudding rises over it) at z +45..+52. */
const CAUSEWAY = [0, 6];
const GATEHOUSE = [0, 49];
const FOG_SOUTH = [0, -34];

function stage(ctx, cs) {
  clearEnemies(ctx);
  const c = castBoss(ctx, cs, { key: 'cacklejaw', id: 'cacklejaw', standIn: 'cacklejaw', fallback: CAUSEWAY });
  const me = ctx.player;
  if (c && me) {
    // she stands 2.4 m north of him (between him and the gate), facing him
    cs.place(c, [c.pos.x, Math.min(c.pos.z, 24)], 0);
    cs.place(me, [c.pos.x, c.pos.z + 2.4], Math.PI);
    c.facing = 0; c.snap?.();
  }
  const p = ctx.companions?.pudding;
  if (p && !p.disposed) { cs.script(p); cs.aliases.set('pudding', p); p.object3d && (p.object3d.visible = false); }
  else cs.spawnOne({ id: 'pudding', type: 'pudding', kind: 'npc', at: [GATEHOUSE[0], GATEHOUSE[1] + 3], facing: Math.PI, visible: false });
  if (c) cs.spawnOne({ id: 'shard', kind: 'object', build: buildShard, at: [c.pos.x + 0.3, c.pos.y + 0.9, c.pos.z + 0.2] });
  const s = built(cs, 'shard');
  if (s) s.visible = false;
  animateBuilt(cs, 'shard');
}

/** Shard 2 tears out of his belt pouch into her planted blade. */
function shardToBlade(ctx, cs) {
  const s = built(cs, 'shard'), me = ctx.player;
  if (!s || !me) return null;
  s.visible = true;
  const from = [s.position.x, s.position.y, s.position.z];
  const to = [me.pos.x + Math.sin(me.facing) * 0.15, me.pos.y + 1.2, me.pos.z + Math.cos(me.facing) * 0.15];
  return flyObject(cs, () => built(cs, 'shard'), from, to, 1.1, 0.9, (u, o) => { if (o && u >= 1) o.visible = false; });
}

/** Pudding rises over the gatehouse, wings spread. */
function puddingRises(ctx, cs) {
  const p = cs.actor('pudding');
  if (!p) return null;
  if (p.object3d) p.object3d.visible = true;
  p.play?.('Flying_Idle', {});
  // "over the gatehouse": he rises out of the fog on the gate side of her, close enough to read through it
  const me = ctx.player, z = Math.min(GATEHOUSE[1], (me?.pos.z ?? 10) + 16);
  const ground = ctx.physics?.heightAt?.(GATEHOUSE[0], z) ?? 0;
  const from = [GATEHOUSE[0], ground - 3, z + 2], to = [GATEHOUSE[0], ground + 6.5, z];
  p.facing = Math.PI; p.snap?.();
  // he hangs there (scripted physics would pull him down) for the rest of the scene
  const hover = flyObject(cs, () => cs.actor('pudding'), from, to, 2.6, 0);
  cs.every((dt) => { const a = cs.actor('pudding'); if (a && cs._puddingUp) { a.pos.set(to[0], to[1], to[2]); a.vel?.set(0, 0, 0); } return !cs.finishing; });
  return hover?.then(() => { cs._puddingUp = true; });
}

/** She walks round to sit beside him, facing the same way (south, into the fog). */
function sitBeside(ctx, cs) {
  const c = cs.actor('cacklejaw'), me = ctx.player;
  if (!c || !me) return null;
  const x = c.pos.x + 1.0, z = c.pos.z + 0.2;
  const y = ctx.physics?.heightAt?.(x, z);
  const p = me.moveTo?.(new THREE.Vector3(x, Number.isFinite(y) ? y : me.pos.y, z), 1.2);
  return Promise.resolve(p).then(() => me.face?.(c.facing, 0.4));
}

const toastOnce = (ctx, cs) => { if (!cs._toasted) { cs._toasted = true; toast(ctx, 'toast.golden', 'golden'); } };

export default {
  id: 'cs09', kind: 'cutscene', skippable: true,
  steps: [
    { t: 'ui', letterbox: true, hud: false },
    { t: 'music', track: null, fade: 1.0 },
    { t: 'call', fn: stage },
    { t: 'actor', id: 'cacklejaw', pose: 'kneel' },
    { t: 'actor', id: 'swordcat', pose: 'idle', expression: 'earnest' },

    // ---- 1 · on his knees; then the furious laugh
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'cacklejaw', pos: [2.2, 0.9, 1.0], fov: 44, lookMid: 1.2 }),
    sfx('cs09.laugh', 'cacklejaw'),
    wait(1.1),
    { t: 'actor', id: 'cacklejaw', pose: 'laugh', emote: 'laugh' },
    { t: 'fx', shake: 0.12 },
    cam(null, 'cacklejaw', { pos: [0.9, 1.55, 3.1], look: [0, 1.7, 0], fov: 40, noise: 0.008, mode: 'handheld' }),
    { t: 'actor', id: 'cacklejaw', pose: 'sneer' },
    say('cacklejaw', 'cs09.1', 3.0),

    // ---- 2 · the horde charges out of the fog
    cam('REVERSE_HORDE', 'swordcat', { fov: 40 }),
    { t: 'fx', horde: 'march', at: [0, -48], to: [0, 2], speed: 4.5, laugh: 1.0, width: 9 },
    { t: 'sfx', id: 'cs09.charge', at: [0, -20], handle: 'chorus' },
    { t: 'actor', id: 'swordcat', emote: 'earsFlat', expression: 'worried' },
    wait(3.2),

    // ---- 3 · the plant; Shard 2; gold (ref1)
    cam('HERO_LOW', 'swordcat'),
    { t: 'actor', id: 'swordcat', pose: 'vigil', expression: 'determined' },
    sfx('cs09.plant', 'swordcat'),
    wait(0.8),
    sfx('cs09.shard', 'swordcat'),
    { t: 'call', fn: shardToBlade, max: 2 },
    { t: 'actor', id: 'swordcat', pose: 'oath' },
    par(
      { t: 'actor', id: 'swordcat', holy: [0, 1], dur: 2.0 },
      { t: 'fx', burst: 'sparkle', at: 'swordcat', count: 160, color: '#FFE3A3' },
      { t: 'fx', bloomSpike: 1.2, bloomDur: 2.4 },
      { t: 'cam', anchor: 'swordcat', mode: 'rail', pos: [0.8, 0.35, 2.2], to: [0.55, 0.5, 1.5], look: [0, 0.9, 0], lookTo: [0, 1.05, 0], fov: [40, 36], dur: 2.0, ease: 'inOutSine', nowait: true },
    ),
    { t: 'call', fn: toastOnce },
    wait(1.4),

    // ---- 4 · Pudding over the gatehouse; the horde scatters
    { t: 'actor', id: 'swordcat', holy: 0.45 },
    { t: 'env', fogDensity: 0.022, dur: 1.2, nowait: true },
    { t: 'cam', anchor: 'swordcat', mode: 'cut', pos: [0.6, 0.3, 1.9], look: [0, 4.5, -16], fov: 62 },
    { t: 'call', fn: puddingRises, max: 4 },
    { t: 'actor', id: 'pudding', emote: 'roar' },
    par(
      sfx('cs09.roar', 'pudding'),
      { t: 'fx', shake: 0.6 },
      { t: 'env', wind: 2.4, dur: 0.2 },
    ),
    say('pudding', 'cs09.2', 2.6),
    cam('REVERSE_HORDE', 'swordcat', { fov: 44 }),
    { t: 'fx', horde: 'flee', from: 'swordcat' },
    { t: 'sfx', stop: 'chorus', fade: 2.5 },
    sfx('cs09.scatter', [0, -18]),
    { t: 'env', wind: 0.6, dur: 1.5, nowait: true },
    wait(2.6),
    { t: 'fx', horde: false },

    // ---- 5 · the empty causeway: the runt who laughed first
    { t: 'actor', id: 'swordcat', holy: 0.15, pose: 'idle', expression: 'earnest' },
    { t: 'actor', id: 'cacklejaw', pose: 'kneel', emote: 'laugh' },
    { t: 'env', fogDensity: 0.05, dur: 2.0, nowait: true },
    cam(null, 'cacklejaw', { pos: [1.6, 1.0, 3.6], look: [0.5, 0.8, 0], fov: 44 }),
    sfx('cs09.sob', 'cacklejaw'),
    wait(1.6),
    { t: 'actor', id: 'cacklejaw', expression: 'sad' },
    { t: 'call', fn: sitBeside, max: 3 },
    { t: 'actor', id: 'swordcat', pose: 'sit' },
    { t: 'sfx', id: 'cs09.purr', at: 'swordcat', loop: true, handle: 'purr' },
    say('cacklejaw', 'cs09.3', 5.0),
    { t: 'actor', id: 'swordcat', expression: 'happy' },
    say('swordcat', 'cs09.4', 3.4),
    sfx('cs09.wheeze', 'cacklejaw'),
    wait(0.9),
    say('cacklejaw', 'cs09.5', 2.2),
    { t: 'actor', id: 'swordcat', emote: 'blink' },
    say('swordcat', 'cs09.6', 1.2),

    // ---- 5b · bonk, then befriend (WA §8.1): she laughs WITH him; his plate flips to CHEER-IN-CHIEF
    wait(0.5),
    { t: 'actor', id: 'swordcat', expression: 'happy', emote: 'blink' },
    say('swordcat', 'cs09.7', 1.0),
    { t: 'actor', id: 'cacklejaw', expression: 'surprised' },
    say('cacklejaw', 'cs09.8', 2.2),
    { t: 'call', fn: (ctx, cs) => { try { cs.actor('cacklejaw')?.flipPlate?.(true); } catch { /* enemies optional */ } } },
    { t: 'actor', id: 'cacklejaw', pose: 'laugh', emote: 'laugh', expression: 'happy' },
    sfx('laugh', 'cacklejaw', { rate: 1.1, vol: 1.0 }),
    say('cacklejaw', 'cs09.9', 2.4),

    // ---- 6 · he bounds off to tell the lads (a hype-man now)
    { t: 'sfx', stop: 'purr', fade: 1.2 },
    { t: 'cam', anchor: 'swordcat', mode: 'cut', pos: [-1.0, 1.4, 2.6], look: [0, 0.9, -6], fov: 44, track: false },
    { t: 'actor', id: 'cacklejaw', pose: 'idle', moveTo: FOG_SOUTH, speed: 2.4, nowait: true },
    { t: 'actor', id: 'swordcat', pose: 'idle' },
    { t: 'env', wind: 1.2, dur: 2, nowait: true },
    wait(4.0),
  ],
  end: {
    call: (ctx, cs, skipped, phase) => {
      if (phase === 'before') { ctx.fx?.horde?.(false); if (cs.actor('pudding') === ctx.companions?.pudding && ctx.companions?.pudding?.object3d) ctx.companions.pudding.object3d.visible = true; }
      else if (skipped) toastOnce(ctx, cs);
    },
    flags: { 'gate.boss': true },
    shards: 2,
    unlock: [{ kind: 'ability', id: 'golden' }],
    despawns: ['cacklejaw'],
    env: { preset: 'gate_dusk', wind: 1.0 },
    music: { track: null, fade: 1.5 },
    cam: 'follow',
    save: true,
    play: 'cs10',
  },
};
