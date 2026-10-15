// Frame cost of the stage island at fixed point counts, with and without CPU throttling.
//
//   node scripts/measure-stage.mjs <site-url> [--out <file.json>] [--gpu | --angle d3d11|metal|swiftshader] [--seconds 6]
//
// For each point count (10k, 20k, 40k, via `?points=N`, which also turns adaptation off) and each
// CPU profile (1x, 4x through CDP Emulation.setCPUThrottlingRate) it loads the stage, waits for
// the island, then samples requestAnimationFrame intervals for N seconds while the page idles at
// the cover (the island keeps rotating and jittering: this is its steady-state cost).
// Reported per run: median and p95 frame interval in ms, the share of frames over 16.7 ms and
// 33.3 ms, and which WebGL renderer string Chromium used (SwiftShader = software, so absolute
// numbers only compare with themselves; the Mac lane `perf` runs it with --gpu on Metal).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const site = args.find((a) => !a.startsWith('--')) || 'https://genome.ichisieben.dev/';
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const out = opt('--out', null);
const seconds = Number(opt('--seconds', '6'));
const gpu = args.includes('--gpu');
const COUNTS = [10000, 20000, 40000];
const CPU = [1, 4];

// --angle picks the backend explicitly (metal on the Mac, d3d11 on a Windows GPU); --gpu = metal.
const angle = opt('--angle', gpu ? 'metal' : 'swiftshader');
// Without these, headless Chromium paces requestAnimationFrame to its own limiter (first Mac run:
// 66 ms frames at 20k points, 133 ms at 10k on an M2 Pro), so it measured the limiter, not the GPU.
const UNTHROTTLE = ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
const launchArgs = [`--use-angle=${angle}`, '--ignore-gpu-blocklist', ...UNTHROTTLE,
  ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : ['--enable-gpu'])];
const browser = await chromium.launch({ args: launchArgs });
const results = [];
try {
  for (const cpu of CPU) {
    for (const n of COUNTS) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
      await page.goto(`${site}?points=${n}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => document.documentElement.dataset.stageMode, null, { timeout: 60000 });
      const mode = await page.evaluate(() => document.documentElement.dataset.stageMode);
      const renderer = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
        return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'none';
      });
      await page.waitForTimeout(1500); // warm-up: shader compile, first uploads
      const frames = await page.evaluate((ms) => new Promise((resolve) => {
        const dts = [];
        let last = 0;
        const end = performance.now() + ms;
        function f(t) {
          if (last) dts.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(f); else resolve(dts);
        }
        requestAnimationFrame(f);
      }), seconds * 1000);
      // Synchronous GPU cost: draw + readPixels per frame (window.__stage.bench, island.ts).
      const gpuFrames = await page.evaluate(() => window.__stage?.bench ? window.__stage.bench(120) : []);
      const g = [...gpuFrames].sort((a, b) => a - b);
      const gq = (p) => g.length ? Number(g[Math.min(g.length - 1, Math.floor(p * g.length))].toFixed(2)) : null;
      const s = [...frames].sort((a, b) => a - b);
      const q = (p) => s.length ? Number(s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2)) : null;
      const r = {
        points: n, cpuThrottle: cpu, mode, renderer, frames: s.length,
        medianMs: q(0.5), p95Ms: q(0.95), gpuMedianMs: gq(0.5), gpuP95Ms: gq(0.95),
        over16: s.length ? Number((s.filter((x) => x > 16.7).length / s.length).toFixed(3)) : null,
        over33: s.length ? Number((s.filter((x) => x > 33.3).length / s.length).toFixed(3)) : null,
        drawn: await page.evaluate(() => window.__stage?.stats?.().points ?? null),
        errors,
      };
      results.push(r);
      console.log(`measure-stage: cpu ${cpu}x points ${n} mode ${mode} rAF median ${r.medianMs} ms p95 ${r.p95Ms} ms | draw+sync median ${r.gpuMedianMs} ms p95 ${r.gpuP95Ms} ms >16.7 ${r.over16} >33.3 ${r.over33} (${renderer})`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
const report = { site, measuredAt: new Date().toISOString(), seconds, angle, launchArgs, platform: process.platform, results };
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 1) + '\n'); }
const bad = results.filter((r) => r.errors.length || r.mode !== 'webgl');
process.exit(bad.length ? 1 : 0);
