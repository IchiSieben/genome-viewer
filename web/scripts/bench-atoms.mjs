// Phase B: frame cost of drawing EVERY heavy atom as a sphere (evidence/identidad/mockup/mol.js),
// measured, not assumed. Serves the mockup folder, opens bench.html per structure and viewport, and
// times frames drawn back to back with a 1-pixel readPixels after each (GPU finished).
//
//   node scripts/bench-atoms.mjs [--angle metal|d3d11|swiftshader] [--out <file.json>]
// The Mac lane `atoms` runs it on Metal. SwiftShader numbers are a CPU rasterizer: not a device.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(HERE, '../../evidence/identidad/mockup');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const angle = opt('--angle', 'swiftshader');
const out = opt('--out', null);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream', '.css': 'text/css', '.woff2': 'font/woff2' };

const server = createServer(async (req, res) => {
  const path = resolve(DIR, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!path.startsWith(DIR)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }).end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const UNTHROTTLE = ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const browser = await chromium.launch({ args: [`--use-angle=${angle}`, '--ignore-gpu-blocklist', ...UNTHROTTLE, ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : ['--enable-gpu'])] });
// Phone: 390 x 844 at DPR 3 (an iPhone's backing store; mol.js caps it at 2). Desktop: 1440 x 900 at DPR 2.
const VIEWS = [{ name: 'phone', w: 390, h: 844, dpr: 3, zoom: 0.62 }, { name: 'desktop', w: 1440, h: 900, dpr: 2, zoom: 0.8 }];
const IDS = ['1bna', '1kx5', '5flm', '4ug0'];
const rows = [];
for (const v of VIEWS) for (const id of IDS) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}bench.html?id=${id}&frames=90&zoom=${v.zoom}`, { waitUntil: 'load' });
  const r = await page.waitForFunction(() => window.__bench, null, { timeout: 120000 }).then((h) => h.jsonValue()).catch((e) => ({ error: e.message }));
  const row = { view: v.name, ...r, errs };
  rows.push(row);
  console.log(JSON.stringify(row));
  await ctx.close();
}
await browser.close();
server.close();
if (out) {
  await mkdir(dirname(resolve(out)), { recursive: true });
  await writeFile(out, JSON.stringify({ angle, measuredAt: new Date().toISOString(), note: 'ms per frame, GPU-synchronous (readPixels), 90 frames, median and p90', rows }, null, 1));
  console.log('bench-atoms: wrote', out);
}
