// Static server for the perf_2 measurement build: dist_perf2/ first, then public/ (assets), port 5803.
// Optional gzip for js/html/json/css (what a real static host does).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIRS = [path.join(import.meta.dirname, 'dist_perf2'), path.join(ROOT, 'public')];
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.hdr': 'application/octet-stream', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json' };
const port = +(process.env.PORT ?? 5803);
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  for (const d of DIRS) {
    const f = path.join(d, p); if (!f.startsWith(d) || !fs.existsSync(f) || !fs.statSync(f).isFile()) continue;
    const ext = path.extname(f), type = TYPES[ext] ?? 'application/octet-stream';
    const gz = /\.(js|html|css|json)$/.test(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '');
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', ...(gz ? { 'content-encoding': 'gzip' } : {}) });
    const s = fs.createReadStream(f); (gz ? s.pipe(zlib.createGzip()) : s).pipe(res); return;
  }
  res.writeHead(404); res.end();
}).listen(port, () => console.log('perf2 serve on', port));
