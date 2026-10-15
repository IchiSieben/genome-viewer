// A demo video of the stage: one slow scroll from the cover to the references, recorded by
// Chromium, with the chapter titles as subtitles timed from the moment each chapter reaches
// mid-screen.
//
//   node scripts/record-stage.mjs <site-url> --out-dir <dir> [--lang en|es] [--gpu] [--seconds 70]
//
// Output in <dir>: stage-<lang>.webm (the raw recording, 1280x720), stage-<lang>.srt.
// tools/mac/media.sh turns them into H.264 and AV1 at 60 fps with the subtitles burnt in. The
// recorder delivers frames at the rate the page paints them; the 60 fps output re-times that
// stream (duplicated frames where the recorder had fewer) and says so in the evidence file.
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const site = args.find((a) => !a.startsWith('--')) || 'https://genome.ichisieben.dev/';
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const outDir = resolve(opt('--out-dir', 'media'));
const lang = opt('--lang', 'en');
const seconds = Number(opt('--seconds', '70'));
const gpu = args.includes('--gpu');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
const tRec = Date.now(); // the recording starts with the page
const url = site + (lang === 'es' ? 'es/' : '');
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.documentElement.dataset.stageMode, null, { timeout: 60000 });
await page.waitForTimeout(3000); // the cover, idle: the catalog starts cycling

const tScroll = Date.now();
// Smooth scroll in small steps; log when each chapter title crosses mid-screen.
const cues = await page.evaluate(async (ms) => {
  const heads = Array.from(document.querySelectorAll('.st-chapter h2, .st-scale h2'));
  const seen = new Map();
  const total = document.documentElement.scrollHeight - innerHeight;
  const start = performance.now();
  await new Promise((done) => {
    function step(t) {
      const p = Math.min(1, (t - start) / ms);
      scrollTo(0, total * (0.5 - 0.5 * Math.cos(Math.PI * p)));
      for (const h of heads) {
        const r = h.getBoundingClientRect();
        if (!seen.has(h) && r.top < innerHeight * 0.5) seen.set(h, t - start);
      }
      if (p < 1) requestAnimationFrame(step); else done();
    }
    requestAnimationFrame(step);
  });
  return heads.filter((h) => seen.has(h)).map((h) => ({ at: seen.get(h), text: h.textContent.trim() }));
}, (seconds - 6) * 1000);
await page.waitForTimeout(2000);
const offset = tScroll - tRec; // cues are relative to the scroll start
const video = page.video();
await ctx.close();
await browser.close();

const srtTime = (ms) => {
  const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60, x = Math.floor(ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(x).padStart(3, '0')}`;
};
const srt = cues.map((c, i) => {
  const a = c.at + offset;
  const b = (cues[i + 1]?.at ?? c.at + 5000) + offset;
  return `${i + 1}\n${srtTime(a)} --> ${srtTime(Math.min(b, a + 6000))}\n${c.text}\n`;
}).join('\n');
writeFileSync(resolve(outDir, `stage-${lang}.srt`), srt);
const raw = await video.path();
renameSync(raw, resolve(outDir, `stage-${lang}.webm`));
console.log(`record-stage: ${lang} ${cues.length} cues, ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${outDir}`);
