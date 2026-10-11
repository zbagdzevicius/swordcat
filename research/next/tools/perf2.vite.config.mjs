// perf_2 measurement build: same as vite.config.js but no public copy, own outDir, with bundle stats.
import base from '../../../vite.config.js';
export default {
  ...base,
  root: new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
  build: { ...base.build, outDir: 'research/next/tools/dist_perf2', emptyOutDir: true, copyPublicDir: false, reportCompressedSize: false, sourcemap: true },
};
