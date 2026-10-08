// tests/unit/_hooks.mjs  (owner: core) — node module customization hooks used by _setup.mjs.
const STUB_EXT = /\.(css|scss|less|glsl|vert|frag|wgsl|svg|png|jpe?g|webp|gif|woff2?|ttf|otf|mp3|ogg|wav|glb|gltf|hdr)$/i;
const STUB_QUERY = /\?(raw|url|inline|worker)\b/;
const PRELUDE = 'import.meta.env ??= { BASE_URL: "./", MODE: "test", DEV: false, PROD: false, SSR: true };import.meta.glob ??= () => ({});';

export async function resolve(specifier, context, next) {
  const bare = specifier.split('?')[0];
  if (STUB_EXT.test(bare) || STUB_QUERY.test(specifier)) return { url: 'stub-asset:' + encodeURIComponent(specifier), shortCircuit: true };
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith('stub-asset:')) return { format: 'module', source: 'export default "";', shortCircuit: true };
  const r = await next(url, context);
  if (r.format === 'module' && /\/src\//.test(url) && !url.includes('/node_modules/') && r.source != null) {
    const src = typeof r.source === 'string' ? r.source : Buffer.from(r.source).toString('utf8');
    return { ...r, source: PRELUDE + src };      // same line: stack-trace line numbers stay correct
  }
  return r;
}
