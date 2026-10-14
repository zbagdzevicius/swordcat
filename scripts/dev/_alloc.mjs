// scripts/dev/_alloc.mjs  (owner: core, dev only, never shipped) — iso FollowCamera heap allocation probe in node.
//   npm run perf:alloc -- [mode=all|noocc|nogather|nosolve|noeng|nocursor|nofp|nosf] [warmFrames=600] [frames=10000]
// Prints the heap growth (KB) over `frames` camera steps with 4 alerted enemies; a mode stubs one camera stage out.
import * as THREE from 'three';
import v8 from 'node:v8'; import vm from 'node:vm';
v8.setFlagsFromString('--expose_gc'); const gc = vm.runInNewContext('gc');
import * as config from '../../src/core/config.js';
import { EventBus } from '../../src/core/EventBus.js';
import { ActorRegistry } from '../../src/core/ActorRegistry.js';
import { Input } from '../../src/core/Input.js';
import { GameState } from '../../src/core/GameState.js';
import { Actor } from '../../src/core/Actor.js';
import { FollowCamera } from '../../src/camera/FollowCamera.js';
const ctx = { game: { mode: 'play', loop: { timeScale: 1 }, hitstopT: 0, time: 0, frameCount: 1 }, params: { cam: 'iso' }, bus: new EventBus(), config, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(45, 16/9, 0.1, 600), actors: new ActorRegistry(), state: new GameState(), enemies: { list: [], boss: null }, levels: { loading: false }, physics: { heightAt: () => 0, raycast: () => null } };
ctx.renderer = { domElement: { clientWidth: 1280, clientHeight: 720, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) } };
ctx.input = new Input(ctx);
const p = new Actor(ctx, { faction: 'player', height: 1 }); p.stateName='idle'; p.charge=0; p.onGround=true; ctx.player=p; ctx.actors.register(p,'swordcat');
for (let i=0;i<4;i++){ const e=new Actor(ctx,{faction:'enemy',height:1}); e.pos.set(Math.sin(i)*5,0,Math.cos(i)*5); e.object3d.position.copy(e.pos); e.alerted=true; ctx.actors.register(e); }
const cam = new FollowCamera(ctx); ctx.cam = cam; await cam.init();
const mode = process.argv[2] || 'all';
if (mode === 'noocc') cam._isoOcclusion = () => {};
if (mode === 'nogather') { cam._gather = () => {}; }
if (mode === 'nosolve') { cam._solve = () => cam._goal; }
if (mode === 'noeng') { cam._engagedSet = () => cam.engaged; }
if (mode === 'nocursor') { cam._isoCursor = () => {}; }
if (mode === 'nofp') { cam._publishFootprint = () => {}; }
if (mode === 'nosf') { cam._refreshSafeFrame = () => {}; }
const step = (k) => { p.object3d.position.x = Math.sin(k*0.01)*3; p.pos.x = p.object3d.position.x; ctx.game.time += 1/60; cam.update(1/60); cam.render(0,1/60); };
for (let i=0;i<+(process.argv[3]||600);i++) step(i);
gc(); const h0 = process.memoryUsage().heapUsed;
for (let i=0;i<+(process.argv[4]||10000);i++) step(i);
gc(); console.log(mode, ((process.memoryUsage().heapUsed-h0)/1024).toFixed(1),'KB');
