// src/camera/CameraShake.js  (owner: camera) — trauma model (tech.md §9.5; Eiserloh "juicing"):
// events ADD trauma (0..1), the offset is trauma² × smooth noise, trauma decays linearly. Rotational only
// (pitch, yaw, roll applied in camera space AFTER lookAt), so the camera never moves into a wall or the ground.
// The juice table (GAME_DESIGN §8.2 / config JUICE) gives the trauma values; settings.shake (0..1) scales it.

/** Smooth, zero-mean noise in about [-1, 1] (two incommensurate sines per channel). */
export function shakeNoise(t, k) {
  return Math.sin(t * 31 + k * 17.3) * 0.6 + Math.sin(t * 57 + k * 5.1) * 0.4;
}

export class CameraShake {
  /**
   * @param {{ decay?: number, pitch?: number, yaw?: number, roll?: number }} [opts]
   *   decay = trauma lost per second; pitch/yaw/roll = max angles (rad) at trauma 1.
   */
  constructor({ decay = 1.6, pitch = 0.035, yaw = 0.035, roll = 0.06 } = {}) {
    this.trauma = 0;
    this.t = 0;
    this.decay = decay;
    this.max = { pitch, yaw, roll };
    /** last applied offsets (rad), for tests and debug */
    this.offset = { pitch: 0, yaw: 0, roll: 0 };
  }

  /** Add trauma (clamped to 1). Negative / NaN values are ignored. */
  add(x) {
    if (!(x > 0)) return this;
    this.trauma = Math.min(1, this.trauma + x);
    return this;
  }

  reset() { this.trauma = 0; this.offset.pitch = this.offset.yaw = this.offset.roll = 0; return this; }

  /** Current intensity (trauma²). */
  get intensity() { return this.trauma * this.trauma; }

  /**
   * Advance by `dt` and compute this frame's offsets (scaled by `scale`, the shake setting). Returns the offset.
   * @param {number} dt @param {number} [scale]
   */
  step(dt, scale = 1) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - this.decay * dt);
    const s = this.trauma * this.trauma * Math.max(0, scale), o = this.offset;
    if (s === 0) { o.pitch = o.yaw = o.roll = 0; return o; }
    o.pitch = this.max.pitch * s * shakeNoise(this.t, 1);
    o.yaw = this.max.yaw * s * shakeNoise(this.t, 2);
    o.roll = this.max.roll * s * shakeNoise(this.t, 3);
    return o;
  }

  /** Step, then rotate `cam` in its local frame (call after lookAt). */
  apply(cam, dt, scale = 1) {
    const o = this.step(dt, scale);
    if (o.pitch === 0 && o.yaw === 0 && o.roll === 0) return;
    cam.rotateX(o.pitch); cam.rotateY(o.yaw); cam.rotateZ(o.roll);
  }
}
