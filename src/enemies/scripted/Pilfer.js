// src/enemies/scripted/Pilfer.js  (owner: enemies) — Pilfer, the Post Stealer, as an AI-less cutscene actor (§3.7;
// CS-02 shot 10 "Mine." / "Also mine."; later the L3 chase and the L4 winch pin). Rogue_Hooded.glb at 1.2 m with a
// skinny hyena head, a "POST STEALER" plate and a mailbag. Props (ScriptedActor.prop):
//   prop('signpost', true)   the lane signpost tucked under his arm (CS-02 plucks it)
//   prop('post_bag', true)   the Royal Post bag in his paw
// Spawn: ctx.enemies.spawn('pilfer', pos, { id: 'pilfer' }).
import { ENEMIES } from '../../core/config.js';
import { buildProp } from '../../characters/index.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { attachAligned, bone, posIn } from '../rig.js';
import { dressKayKit, addHeldProp } from '../types/kaykitGear.js';

const HIDE = [...ENEMIES.stealer.hide, 'Knife', 'Knife_Offhand'];

/** Pilfer's props: build on first use, then toggle. */
function setProp(e, name, on) {
  let p = e.extraProps[name];
  const m = e.model;
  if (!p && on && m) {
    if (name === 'signpost') {
      const chest = bone(m.scene, 'chest');
      p = buildProp('signpost');
      if (chest && p) {
        const c = posIn(m.root, chest);
        attachAligned(m.root, chest, p, { pos: [c.x + 0.22, c.y - 0.12, c.z - 0.35], rot: [Math.PI / 2 - 0.25, 0, 0.12], scale: 0.62 });
        p.traverse((x) => { if (x.isMesh) x.castShadow = true; });
        e.extraProps.signpost = p;
      }
    } else if (name === 'post_bag') p = addHeldProp(e, m, 'post_bag', 'handslot.r', { down: 0.04, scale: 1.1 });
  }
  if (p) p.visible = !!on;
  e.wantProps[name] = !!on;
}

export default {
  id: 'pilfer',
  model: ENEMIES.stealer.model, fit: 'pilfer', hide: HIDE,
  radius: 0.35, height: 1.2, mass: 1, hp: 30, poise: 1, walk: 2.0, run: 6.0, sight: 0, leash: 999,
  aiLess: true, hurtable: false, smallHeart: false, tags: ['cutscene'],
  anims: { ...CLIP_MAPS.kaykit.roles },
  init(e) { e.wantProps = {}; },
  async build(e, m) {
    await dressKayKit(e, m, { head: 'hyena', headNode: 'Rogue_Head_Hooded', headOpts: { mane: false, scale: 1.2 }, plate: 'POST STEALER', expression: 'sneer' });
    for (const [n, on] of Object.entries(e.wantProps)) setProp(e, n, on);       // props asked for before the model loaded
  },
  onProp: setProp,
};
