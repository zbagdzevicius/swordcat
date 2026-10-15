// tests/smoke/_kbm.mjs  (owner: K, TT3) — keyboard-and-mouse helpers shared by the smoke blocks (no blocks here).
// TOKENTAILS-PLAN §11.2: the default `hybrid` preset walks on WASD (click-to-move lives in `moba`, `diablo` and
// `mouseOnly`), RMB / Q / L = the Stand, Space = jump. A desktop player who follows the guide steers with WASD.

/**
 * Hold WASD toward world (x, z) until she is within `r` m (or `ms` pass, a scene starts or play stops). Re-aims every
 * `step` ms from the screen direction of a point 1.5 m from her toward the goal (always near her, so on screen).
 * With `hop` (default on) a walk that stalls against something low taps Space (jump), the way a player hops the
 * practice fence. `page` / `G` default to the main smoke page. Returns her final distance to the goal.
 */
export async function walkKeys(t, x, z, { r = 0.6, ms = 8000, step = 140, hop = true, page = t.page, G = t.G } = {}) {
  const held = new Set();
  const set = async (want) => {
    for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const t0 = Date.now();
  let d = Infinity, best = Infinity, stall = 0;
  try {
    while (Date.now() - t0 < ms) {
      const s = await G(([a, b]) => {
        const g = window.__GAME__, p = g.ctx.player.pos, dx = a - p.x, dz = b - p.z, L = Math.hypot(dx, dz) || 1;
        const k = Math.min(1.5, L) / L;
        const me = g.screen(p.x, p.z), ahead = g.screen(p.x + dx * k, p.z + dz * k);
        return { d: L, sx: ahead && me ? ahead.x - me.x : 0, sy: ahead && me ? ahead.y - me.y : 0, play: g.mode === 'play' && !g.ctx.story.isPlaying && !g.ctx.levels.loading };
      }, [x, z]);
      d = s.d;
      if (d <= r || !s.play) break;
      const L = Math.hypot(s.sx, s.sy) || 1, ux = s.sx / L, uy = s.sy / L, want = new Set();
      if (uy < -0.38) want.add('KeyW'); else if (uy > 0.38) want.add('KeyS');
      if (ux < -0.38) want.add('KeyA'); else if (ux > 0.38) want.add('KeyD');
      await set(want);
      if (d < best - 0.08) { best = d; stall = 0; } else if (++stall >= 4 && hop) { await page.keyboard.down('Space'); await page.waitForTimeout(300); await page.keyboard.up('Space'); stall = 0; best = d; }   // a held jump (a tap is cut short)
      await page.waitForTimeout(d < 1.5 ? 50 : step);
    }
  } finally { await set(new Set()); }
  return d;
}

/** Press the Stand with the right mouse button (the `hybrid` Stand) over the canvas centre for `ms`. */
export async function standRmb(t, ms = 250, { page = t.page } = {}) {
  const vp = page.viewportSize();
  await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height * 0.45));
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(ms);
  await page.mouse.up({ button: 'right' });
}

/** TT3 §11.2: switch the KBM preset in the page (the harness puts every block back on `hybrid`). */
export const setPreset = (t, name, G = t.G) => G((n) => {
  const c = window.__GAME__.ctx;
  c.state.settings.controlPreset = n;
  c.bus.emit('settings:changed', { key: 'controlPreset', value: n });
  c.input.rebind(n);
  return c.input.preset;
}, name);

/**
 * Walk on WASD along the Pink Paw trail for up to `ms` (what a desktop player follows): every `step` ms, steer from
 * Clem's screen point (`guide().me`) toward a lit print `ahead` prints out (the trail bends round fences and props),
 * else the edge coin, else the badge. A stall taps a held Space (fence hops). Stops early when `done()` (page fn) is
 * truthy or no guide is drawn. Returns whether `done` became true.
 */
export async function followTrail(t, { ms = 6000, step = 160, ahead = 1, done = null, page = t.page, G = t.G } = {}) {
  const held = new Set();
  const set = async (want) => {
    for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const t0 = Date.now();
  let last = null, stall = 0, hops = 0, ok = false;
  try {
    while (Date.now() - t0 < ms) {
      const s = await G(([k, src]) => {
        const g = window.__GAME__, gd = g.guide?.(), W = innerWidth, H = innerHeight, p = g.ctx.player.pos;
        const fin = src ? !!new Function(`return (${src})`)()() : false;
        // an ambient scene (a bark like G-01) leaves her in control: only a mode change or a load stops the walk
        const play = g.mode === 'play' && !g.ctx.levels.loading;
        const lit = (gd?.prints ?? []).filter((q) => q.lit && q.sx >= 0 && q.sy >= 0 && q.sx <= W && q.sy <= H);
        const to = gd?.ring ? null : lit.length ? lit[Math.min(lit.length - 1, k)] : gd?.edge ?? gd?.badge ?? null;
        return { fin, play, me: gd?.me ? { x: gd.me.sx, y: gd.me.sy } : null, to: to ? { x: to.sx, y: to.sy } : null, p: [p.x, p.z] };
      }, [ahead, done ? String(done) : null]);
      if (s.fin) { ok = true; break; }
      if (!s.play || !s.me || !s.to) { await set(new Set()); if (!s.play) break; await page.waitForTimeout(step); continue; }
      const dx = s.to.x - s.me.x, dy = s.to.y - s.me.y, L = Math.hypot(dx, dy);
      const want = new Set();
      if (L > 14) {
        const ux = dx / L, uy = dy / L;
        if (uy < -0.38) want.add('KeyW'); else if (uy > 0.38) want.add('KeyS');
        if (ux < -0.38) want.add('KeyA'); else if (ux > 0.38) want.add('KeyD');
      }
      await set(want);
      const moved = last ? Math.hypot(s.p[0] - last[0], s.p[1] - last[1]) : 1;
      last = s.p;
      if (want.size && moved < 0.05) {
        // stuck against something: first a held jump (a low fence), then slide along it on the side key alone
        // (a gate post or leaf: the trail's diagonal pushes into it), the way a player wiggles round a corner
        if (++stall >= 4) {
          if (!(hops++ % 2)) { await page.keyboard.down('Space'); await page.waitForTimeout(300); await page.keyboard.up('Space'); }
          else { const side = dx < 0 ? 'KeyA' : 'KeyD'; await set(new Set([side])); await page.waitForTimeout(450); }
          stall = 0;
        }
      } else stall = 0;
      await page.waitForTimeout(step);
    }
  } finally { await set(new Set()); }
  return ok;
}
