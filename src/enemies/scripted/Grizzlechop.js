// src/enemies/scripted/Grizzlechop.js  (owner: enemies; added by core integration for requests/story.md) — Captain
// Grizzlechop as an AI-less cutscene actor (CS-05 "Cheese and Consequences" stand-in, used when the defeated
// `boss_grizzlechop` is already gone): the same Rat.glb body, feathered hat, cheese shield and sabre as B1, but no
// moves, no hurtbox, no boss bar. Spawn: ctx.enemies.spawn('grizzlechop', pos, { id: 'grizzlechop', facing }); story
// drives him with the ScriptedActor API (moveTo / face / pose('kneel') / play / emote).
import bossGrizzlechop from '../types/boss_grizzlechop.js';

export default {
  id: 'grizzlechop',
  model: bossGrizzlechop.model, fit: bossGrizzlechop.fit, role: bossGrizzlechop.role,
  body: bossGrizzlechop.body,
  faction: 'enemy', radius: bossGrizzlechop.radius, height: bossGrizzlechop.height, mass: 4, hp: 400, poise: 15,
  walk: 1.6, run: 3.5, sight: 0, fov: 2.44, leash: 999,
  aiLess: true, hurtable: false, smallHeart: false, fish: null, scamper: false, tags: ['cutscene'],
  anims: { ...bossGrizzlechop.anims },
  build: (e, m) => bossGrizzlechop.build(e, m),
};
