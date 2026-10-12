// src/main.js  (owner: core) — boot: new Game(#app).start()
import { Game, dropSplash } from './core/Game.js';

const host = document.getElementById('app') ?? document.body;
const game = new Game(host);

game.start().catch((e) => {
  console.error('[boot] failed to start', e);
  dropSplash();
  const el = document.createElement('div');
  el.id = 'boot-error';
  el.textContent = 'Swordcat could not start: ' + (e?.message ?? e);
  document.body.appendChild(el);
});

if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
