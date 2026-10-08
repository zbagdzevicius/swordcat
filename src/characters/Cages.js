// A cage with a kitten inside (GAME_DESIGN §12.1 `cage` kittens, CS-02's carried cages with Pearl's pink ribbon,
// D-01 Mochi's cart cage, D-02 Sage's treetop cage, D-06 Pip's war-wagon cage).
//   const c = cagedKitten(ctx, 'pearl', { style: 'carry', ribbon: true });
//   scene.add(c.root);  per frame: c.render(frameDt);  break it: c.setOpen(1) then c.release() → the KittenView
import * as THREE from 'three';
import { buildCage } from './Props/ProcProps.js';
import { catConfig } from './configs.js';
import { KittenView } from './KittenView.js';

/** Inner kitten scale per cage style (the cage is sized in metres; kittens are ~0.7–1.1 m tall). */
const FIT = { carry: 0.62, hanging: 0.8, cart: 0.95, kennel: 0.78 };

/**
 * @param {any} ctx game ctx (or null)
 * @param {string|object} who cat id (configs.catConfig) or a buildKitten config
 * @param {{ style?: 'carry'|'hanging'|'cart'|'kennel', ribbon?: boolean|string, size?: number[], pose?: string,
 *           expression?: string, kittenScale?: number }} [o]
 */
export function cagedKitten(ctx, who, o = {}) {
  const style = o.style || 'carry';
  const root = new THREE.Group(); root.name = 'caged:' + (typeof who === 'string' ? who : who?.id ?? 'kitten');
  const cage = buildCage({ style, ribbon: o.ribbon, size: o.size });
  root.add(cage);
  const base = typeof who === 'string' ? catConfig(who) : who;
  if (!base) throw new Error(`[characters] unknown cat id "${who}"`);
  const H = cage.userData.size?.[1] ?? o.size?.[1] ?? 0.95;
  const s0 = base.scale ?? 1;
  // fit the kitten inside the bars: its height (scale) at most FIT × the cage's inner height
  const scale = o.kittenScale ?? Math.min(s0, (FIT[style] ?? 0.7) * H / 0.98);
  const cfg = { ...base, scale, cape: base.cape && style === 'carry' ? null : base.cape, sword: null };
  const view = new KittenView(ctx, cfg, { parent: root, pose: o.pose ?? (style === 'carry' ? 'sit' : 'idle'), expression: o.expression ?? 'sad', memeCam: false });
  view.root.position.y = style === 'hanging' ? 0.05 : style === 'cart' ? 0.0 : 0.05;
  view.root.rotation.y = style === 'kennel' ? 0 : 0.25;
  let released = false;
  return {
    root, cage, view, kitten: view.kitten,
    /** Door hinge 0 (shut) .. 1 (open). */
    setOpen(t) { cage.userData.setOpen(t); },
    /** Per rendered frame (idle life, blinking). */
    render(frameDt) { if (!released) view.render(frameDt); },
    /** Hand the kitten over (it leaves the cage group, keeping its world transform); returns the KittenView. */
    release() {
      if (released) return view;
      released = true;
      view.root.updateWorldMatrix(true, false);
      const m = view.root.matrixWorld.clone();
      view.root.removeFromParent();
      m.decompose(view.root.position, view.root.quaternion, view.root.scale);
      return view;
    },
    dispose() { if (!released) view.dispose(); cage.removeFromParent(); cage.traverse((c) => { if (c.isMesh) c.geometry.dispose(); }); root.removeFromParent(); },
  };
}
