import * as C from '../../src/characters/index.js';
const k=C.buildKitten(C.swordcatConfig({cape:'red'}));
k.root.traverseVisible(o=>{ if(o.isMesh && !o.name){ let p=o, path=[]; while(p){path.push(p.name||p.type); p=p.parent;} console.log(path.join('<'), o.material.type, o.geometry.type);} });
k.root.traverseVisible(o=>{ if(o.isMesh) console.log(o.name, o.material.type, o.isSkinnedMesh?'skinned':o.isInstancedMesh?'inst':'plain', o.castShadow); });
