// scripts/dev/_fx.mjs  (owner: core, dev only, never shipped) — prints the camera SafeFrame core rect and anchor for the
// desktop / phone / lefty / portrait / tablet HUD layouts.   node scripts/dev/_fx.mjs
import { SafeFrame } from '../../src/camera/SafeFrame.js';
const sf = new SafeFrame();
const R = (w,h)=>(x0, y0, x1, y1, kind) => ({ x: x0 * w, y: y0 * h, w: (x1 - x0) * w, h: (y1 - y0) * h, kind });
const P = {
 desktop:[1920,1080,(r)=>[r(0, 0, 0.30, 0.07, 'hud'), r(0.30, 0.93, 0.70, 1, 'bar')]],
 phone:[844,390,(r)=>[r(0, 0, 0.42, 0.15, 'hud'), r(0, 0.15, 0.19, 1, 'stick'), r(0, 0.85, 0.62, 1, 'stick'), r(0.655, 0.32, 1, 1, 'cluster'), r(0.82, 0.15, 1, 0.32, 'cluster')]],
 lefty:[844,390,(r)=>[r(0.58, 0, 1, 0.15, 'hud'), r(0.81, 0.15, 1, 1, 'stick'), r(0.38, 0.85, 1, 1, 'stick'), r(0, 0.32, 0.345, 1, 'cluster'), r(0, 0.15, 0.18, 0.32, 'cluster')]],
 portrait:[390,844,(r)=>[r(0, 0, 1, 0.08, 'hud'), r(0, 0.63, 1, 1, 'cluster')]],
 tablet:[1180,820,(r)=>[r(0, 0, 0.40, 0.09, 'hud'), r(0, 0.09, 0.13, 1, 'stick'), r(0, 0.87, 0.73, 1, 'stick'), r(0.73, 0.25, 1, 1, 'cluster')]],
};
for (const [k,[w,h,f]] of Object.entries(P)) { sf.rebuild(w,h,null,f(R(w,h))); const c=sf.core; console.log(k, [c.x0,c.x1,c.y0,c.y1].map(v=>v.toFixed(3)).join(' '), sf.ax.toFixed(3), sf.ay.toFixed(3)); }
