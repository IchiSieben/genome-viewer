// Posters and Open Graph images of the stage, rendered from the real WebGL island.
//
//   npm run build   (with AGP_BASE=/ so the pages resolve from the server root)
//   node scripts/build-posters.mjs [--out-dir <dir>] [--only 1BNA,4UG0]
//
// For every structure in dist/stage/index.json it opens `/?still=<id>&points=20000`, which
// freezes the island on that structure (fixed clock, no cycling, no adaptation), hides
// everything but the canvas and saves the frame as WebP into public/stage/posters/<id>.webp.
// The posters are what a visitor without WebGL2, or with reduced motion, sees in its place:
// they are a picture of the same points, not an illustration.
//
// Then one 1200x630 picture of each cover (`/` and `/es/`, frozen on 1KX5) goes to
// public/og-stage-<lang>.png, the og:image that build-stage.mjs writes into the <head>.
//
// Headless Chromium draws WebGL2 through SwiftShader on a machine without a usable GPU; the
// Mac lane `posters` (tools/mac/posters.sh) runs this same script on Metal for comparison.
// WebP is encoded by Chromium itself (canvas.toDataURL), so no image library is needed.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '../dist');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const OUT = resolve(opt('--out-dir') || resolve(here, '../public'));
const only = opt('--only')?.split(',');

if (!existsSync(resolve(DIST, 'stage/index.json'))) {
  console.error('build-posters: dist/stage/index.json missing; run npm run build first');
  process.exit(1);
}
const index = JSON.parse(readFileSync(resolve(DIST, 'stage/index.json'), 'utf8'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.agsc': 'application/octet-stream', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.bin': 'application/octet-stream' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join(DIST, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!f.startsWith(DIST) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const HIDE = 'body * { visibility: hidden !important; } .stage, .stage canvas { visibility: visible !important; } html { scrollbar-width: none; }';

async function frozen(page, path, id, hideText) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${origin}${path}?still=${id}&points=20000`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.stageMode === 'webgl', null, { timeout: 30000 });
  if (hideText) await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(1500); // a few frames on the fixed clock
  if (errors.length) throw new Error(`${path} ${id}: ${errors.join(' | ')}`);
}

async function toWebp(page, png, quality = 0.82) {
  const b64 = png.toString('base64');
  const url = await page.evaluate(async ({ b64, quality }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', quality);
  }, { b64, quality });
  if (!url.startsWith('data:image/webp')) throw new Error('build-posters: this Chromium cannot encode WebP');
  return Buffer.from(url.split(',')[1], 'base64');
}

try {
  mkdirSync(resolve(OUT, 'stage/posters'), { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  for (const s of index.structures) {
    if (only && !only.includes(s.id)) continue;
    const page = await ctx.newPage();
    await frozen(page, '/', s.id, true);
    const webp = await toWebp(page, await page.screenshot({ type: 'png' }));
    const file = resolve(OUT, `stage/posters/${s.id.toLowerCase()}.webp`);
    writeFileSync(file, webp);
    console.log(`build-posters: ${s.id} -> ${file} (${(webp.length / 1024).toFixed(1)} KiB)`);
    await page.close();
  }
  await ctx.close();

  if (!only) {
    const og = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    for (const [lang, path] of [['en', '/'], ['es', '/es/']]) {
      const page = await og.newPage();
      await frozen(page, path, '1KX5', false); // 1BNA has 486 atoms: too faint for a card
      const png = await page.screenshot({ type: 'png' });
      const file = resolve(OUT, `og-stage-${lang}.png`);
      writeFileSync(file, png);
      console.log(`build-posters: og ${lang} -> ${file} (${(png.length / 1024).toFixed(1)} KiB)`);
      await page.close();
    }
    await og.close();
  }
} finally {
  await browser.close();
  server.close();
}
