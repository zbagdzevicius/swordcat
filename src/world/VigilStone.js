// src/world/VigilStone.js  (owner: world) — checkpoints (GAME_DESIGN §7.6, §12.1 `kind: 'checkpoint'`, ids vigil_1..n):
// a waystone (`env/nature/stone_tallB.glb`, sandstone) + a paper lantern on a crook (LI W10; LevelKit places both). Walk within 1.5 m and press E
// (interact): she plants the sword in Vigil (player handles the 0.8 s pose on `checkpoint`), the lantern lights gold.
// Effect: save (save autosaves on `checkpoint`), full heal + milk refill + Still Standing re-arm (player), companion
// swap (ui), and the respawn point. Every stone is also a spawn id (`vigil_n`, standing 1.4 m in front of it) so
// "Continue" and retries can load at it. `activate({ silent })` lights it from code (The Line's auto-activation).
import * as THREE from 'three';
import { E } from '../core/events.js';
import { makeGlowSprite } from './Sky.js';
import { fxBasicMaterial } from '../fx/shaders.js';

/**
 * Vigil look: the paper lantern hangs `paperOff` m out on the crook arm at `lanternH` m; unlit it is plain paper, lit
 * it glows lantern gold and feeds the lamp pools (`env.lamps`, radius from `lampDist`).
 */
export const VIGIL = Object.freeze({ radius: 1.5, lanternH: 0.86, paperOff: 0.26, glow: '#FFD98A', unlit: '#F2E4C6', lit: '#FFC46B', litMul: 2.2, lampDist: 7, lampI: 1.6 });

export class VigilStone {
  /**
   * @param {any} ctx @param {any} level
   * @param {{ id: string, at: [number, number], facing?: number, heightAt: (x:number,z:number)=>number }} o
   */
  constructor(ctx, level, o) {
    this.ctx = ctx; this.level = level;
    this.id = o.id;
    const [x, z] = o.at;
    this.pos = new THREE.Vector3(x, o.heightAt(x, z), z);
    this.facing = o.facing ?? 0;
    this.lit = false; this.litT = 0; this.flash = 0;
    /** where she stands / respawns (1.4 m in front of the stone, facing away from it) */
    this.spawn = { pos: new THREE.Vector3(x + Math.sin(this.facing) * 1.4, 0, z + Math.cos(this.facing) * 1.4), facing: this.facing };
    this.spawn.pos.y = o.heightAt(this.spawn.pos.x, this.spawn.pos.z);
    // lantern flame + glow (the stone and the lantern body are batched props placed by LevelKit)
    this.group = new THREE.Group(); this.group.name = 'vigil:' + this.id;
    const side = this._lanternOffset();
    this.flameMat = fxBasicMaterial({ color: VIGIL.unlit, fog: true });   // PERF §1.2: the fx basic module (shared program)
    this.flameMat.userData.owned = true;
    this.flame = new THREE.Mesh(new THREE.SphereGeometry(0.118, 12, 8), this.flameMat);
    this.flame.scale.set(1, 1.35, 1);          // the paper shade itself: plain paper unlit, glowing gold when lit
    // the paper hangs on the crook arm (LevelKit yaws the lantern template facing + π/2)
    const ly = this.facing + Math.PI / 2;
    this.flame.position.set(side.x + Math.cos(ly) * VIGIL.paperOff, this.pos.y + VIGIL.lanternH, side.z - Math.sin(ly) * VIGIL.paperOff);
    /** lamp-pool source (ENV_U.uLamps) while lit */
    this.lamp = { pos: this.flame.position.clone(), on: false, intensity: VIGIL.lampI, distance: VIGIL.lampDist, flicker: 0.15 };
    ctx.env?.lamps?.add?.(this.lamp);
    this.flame.userData.owned = true;
    // fog: false like every glow sprite (PERF §1.2: one sprite program; a glow is light, it reads through fog)
    this.glow = makeGlowSprite({ color: VIGIL.glow, size: 0.9, intensity: 1.6, fog: false });
    this.glow.position.copy(this.flame.position).setY(this.flame.position.y + 0.3);
    this.glow.visible = false;
    this.group.add(this.flame, this.glow);
    level.groups.props.add(this.group);
    const stone = this;
    this.interactable = {
      id: this.id, kind: 'vigil', pos: this.pos, r: VIGIL.radius + 0.35,
      // a lit stone swaps kittens (§9.1, companions listens to `interact` kind 'vigil') when a swap is possible
      get prompt() {
        const comp = stone.ctx.companions;
        return stone.lit && typeof comp?.canSwap === 'function' && comp.canSwap() && stone.ctx.strings?.has?.('prompt.swap') ? 'prompt.swap' : 'tut.vigil';
      },
      use: () => this.activate(),
    };
  }

  /** Lantern position relative to the stone (on its left as seen from the path). */
  _lanternOffset() {
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    return { x: this.pos.x + c * 0.55 + s * 0.15, z: this.pos.z - s * 0.55 + c * 0.15 };
  }

  /** Light the stone and make it the checkpoint. `silent`: no checkpoint event (visual restore only). */
  activate({ silent = false } = {}) {
    const ctx = this.ctx;
    for (const v of this.level.vigils) if (v !== this) v.setLit(false);
    this.setLit(true);
    this.flash = 1;
    if (silent) return;
    const st = ctx.state;
    if (st) { st.levelId = this.level.id; st.spawnId = this.id; }
    if (st?.runtime) st.runtime.worldVigil = { levelId: this.level.id, id: this.id };
    ctx.bus.emit(E.CHECKPOINT, { levelId: this.level.id, spawnId: this.id, position: this.spawn.pos.clone(), facing: this.spawn.facing, id: this.id });
    ctx.bus.emit(E.BURST, { kind: 'sparkle', position: this.flame.position.clone(), count: 18 });
  }

  setLit(on) {
    this.lit = !!on;
    this.flameMat.color.set(on ? VIGIL.lit : VIGIL.unlit);
    if (on) this.flameMat.color.multiplyScalar(VIGIL.litMul);
    if (this.lamp) this.lamp.on = this.lit;
    this.glow.visible = this.lit;
  }

  update() {}

  render(dt, t) {
    if (!this.lit) return;
    this.flash = Math.max(0, this.flash - dt * 1.5);
    const flick = 1 + Math.sin(t * 13.1 + this.pos.x) * 0.06 + Math.sin(t * 7.3) * 0.05;
    this.glow.scale.setScalar(0.9 * flick * (1 + this.flash * 1.2));
    const k = 1 + (flick - 1) * 0.4; this.flame.scale.set(k, 1.35 * k, k);
  }

  dispose() {
    this.ctx.env?.lamps?.remove?.(this.lamp);
    this.group.removeFromParent();
    this.flame.geometry.dispose(); this.flameMat.dispose();
    this.glow.material.dispose();
  }
}
