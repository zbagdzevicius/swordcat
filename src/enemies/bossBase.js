// src/enemies/bossBase.js  (owner: enemies) — the shared part of every boss def (GAME_DESIGN §11.1): the Appendix A
// BOSSES row + BOSS_MODELS model/role, a capsule sized to the fitted height, wide senses, no leash, no small heart,
// the rig's clip roles. Boss type files (types/boss_<key>.js) spread this and add their moves / states / build.
import { BOSSES, BOSS_MODELS, MODEL_FIT } from '../core/config.js';
import { CLIP_MAPS, rigFor } from './clipMaps.js';

/** Fitted height for a boss key (MODEL_FIT role, else the row's fit). Pure. */
export function bossHeight(key) {
  const b = BOSSES[key], m = BOSS_MODELS[key];
  if (!b) return 2;
  return m ? (MODEL_FIT[m.model]?.uses?.[m.role] ?? b.fit?.h ?? 2) : (b.fit?.h ?? 2);
}

/**
 * Base def for `boss_<key>` (null for an unknown key).
 * @param {string} key @param {object} [look] extra fields (hide / show / tint / build / body)
 */
export function bossDef(key, look = {}) {
  const b = BOSSES[key];
  if (!b) return null;
  const m = BOSS_MODELS[key], h = bossHeight(key), rig = m ? rigFor(m.model) : null;
  return {
    radius: Math.max(0.5, h * 0.22), height: h, mass: 4, sight: 30, fov: 6.28, leash: 60, walk: 2.0, run: 3.5,
    anims: rig ? { ...CLIP_MAPS[rig].roles } : {}, smallHeart: false,
    ...b, ...look, hp: Array.isArray(b.hp) ? b.hp[0] : b.hp, model: m?.model, role: m?.role, fit: m?.role ?? b.fit,
    id: `boss_${key}`, key, boss: true,
  };
}
