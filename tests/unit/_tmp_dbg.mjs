import * as THREE from 'three';
import * as C from '../../src/characters/index.js';
for (const prop of ['legacy', undefined]) {
  const base = C.CATS.mochi; C.CATS.mochi = { ...base, proportions: prop };
  const c = C.cagedKitten(null, 'mochi', { style: 'cart' }); c.render(1/60); c.root.updateMatrixWorld(true);
  const kb = new THREE.Box3().setFromObject(c.kitten.kitMesh);
  console.log(prop, kb.max.y.toFixed(3), c.kitten.poseName, c.kitten.cfg.scale, c.kitten.headScale);
  C.CATS.mochi = base;
}
