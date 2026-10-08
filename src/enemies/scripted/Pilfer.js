// src/enemies/scripted/Pilfer.js  (owner: enemies) — Pilfer, the Post Stealer, as an AI-less cutscene actor (§3.7;
// CS-02 shot 10 "Mine." / "Also mine."; later the L3 chase and the L4 winch pin). Rogue_Hooded.glb at 1.2 m with a
// skinny hyena head, a "POST STEALER" plate. Props (ScriptedActor.prop):
//   prop('signpost', true)   the lane signpost tucked under his left arm (CS-02 plucks it)
//   prop('post_bag', true)   the Royal Post bag in his right paw
// Spawn: ctx.enemies.spawn('pilfer', pos, { id: 'pilfer', facing }).
import { ENEMIES } from '../../core/config.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { dressKayKit, addHeldProp, loadedCharacters } from '../types/kaykitGear.js';

const HIDE = [...ENEMIES.stealer.hide, 'Knife', 'Knife_Offhand'];

/** Pilfer's props: built on first use, then toggled. The signpost rides his left hand (characters' carry offsets);
 *  the post bag hangs from his right fist like a pendulum. */
function setProp(e, name, on) {
  e.wantProps[name] = !!on;
  const d = e.dress, C = loadedCharacters();
  if (!d || !C || !e.model) return;                          // applied in build() once the model is dressed
  let p = e.extraProps[name];
  if (!p && on) {
    if (name === 'signpost') { p = d.hold('signpost', 'l'); p?.traverse((x) => { if (x.isMesh) x.castShadow = true; }); }
    else if (name === 'post_bag') p = addHeldProp(e, e.model, 'post_bag', 'handslot.r', { down: 0.28, scale: 1.1 }, C);
    if (p) e.extraProps[name] = p;
  }
  if (p) p.visible = !!on;
}

export default {
  id: 'pilfer',
  model: ENEMIES.stealer.model, fit: 'pilfer', hide: HIDE,
  faction: 'enemy', radius: 0.35, height: 1.2, mass: 1, hp: 30, poise: 1, walk: 2.0, run: 6.0, sight: 0, fov: 2.79, leash: 999,
  aiLess: true, hurtable: false, smallHeart: false, fish: null, tags: ['cutscene'],
  anims: { ...CLIP_MAPS.kaykit.roles },
  init(e) { e.wantProps = {}; },
  async build(e, m) {
    await dressKayKit(e, m, { look: 'pilfer', headNode: 'Rogue_Head_Hooded', expression: 'sneer' });
    for (const [n, on] of Object.entries(e.wantProps)) setProp(e, n, on);       // props asked for before the model loaded
  },
  onProp: setProp,
};
