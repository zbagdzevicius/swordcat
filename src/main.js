// src/main.js  (owner: core) — boot: new Game(#app).start()
// Order matters: embed mode is marked on <html> before anything renders (ui reads data-embed), the lazy-chunk reload
// guard is installed before the first dynamic import, and the embed bridge listens from the first frame.
import { embedActive, markEmbed, installEmbedBridge } from './core/embed.js';
import { installPreloadErrorReload, showRecovery } from './core/recovery.js';
import { Game, dropSplash } from './core/Game.js';
import { installTreatPanel, standaloneMode } from './shelter/treat.js';

const embedded = embedActive(location.search, window);
if (embedded) markEmbed(document);
installPreloadErrorReload(window);

const host = document.getElementById('app') ?? document.body;
const game = new Game(host);

const started = game.start();
if (embedded) installEmbedBridge(game);
// outside the Token Tails frame: on https://tokentails.com the card sends the guest treat itself (treatApi.js); on any
// other host it shows a new-tab link to tokentails.com/swordcat and a Copy link button. The game tab never navigates.
else installTreatPanel(game, { mode: standaloneMode(location) });

started.catch((e) => {
  console.error('[boot] failed to start', e);
  dropSplash();
  // a friendly panel, never the raw error text (the console has it)
  showRecovery('boot', { strings: game.ctx?.strings ?? null, onAction: () => location.reload() });
});

if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
