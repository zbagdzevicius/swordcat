// src/core/uniforms.js  (owner: core) — shared uniforms (IMPLEMENTATION_PLAN §7.2 core surface).
import * as THREE from 'three';

/**
 * The drawing-buffer size in device px (`{ value: Vector2 }`), shared by reference into every material that needs
 * screen-space widths (characters' outline hulls, fx). PostFX writes it on every resize and pixel-ratio step, in the
 * same frame (PERF §5.1, gate `perf:dynres-step`). Never replace `.value`; read it, or `set()` it from core only.
 */
export const uViewport = { value: new THREE.Vector2(1, 1) };
