// tests/unit/_setup.mjs  (owner: core) — preloaded by `npm run test:unit` (node --import). Registers loader
// hooks so browser/Vite-only constructs don't break pure-module tests: non-JS imports (.css, images,
// shaders, ?raw / ?url) resolve to empty modules, and src/ modules get `import.meta.env` / `import.meta.glob`.
import { register } from 'node:module';

register('./_hooks.mjs', import.meta.url);
