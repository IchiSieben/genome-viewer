// Medicion de rendimiento. El encargo dice medir, no suponer, asi que esto
// produce numeros y los escribe en docs/evidence/.
//
// Mide tres cosas:
//   1. tiempo hasta que la vista es INTERACTIVA (no hasta que carga el HTML),
//      con y sin estrangular la red a 3G lento,
//   2. milisegundos de render por frame durante un desplazamiento real,
//   3. pico de memoria del heap de JavaScript.
//
// Uso: node scripts/serve-subfolder.mjs --run "node scripts/measure.mjs"

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../docs/evidence/performance.json');
const BASE = 'http://127.0.0.1:8099/alphagenome/';
const VARIANT = '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T';

// 3G lento, los valores que usan las herramientas de desarrollo de Chrome.
const SLOW_3G = {
  offline: false,
  downloadThroughput: (400 * 1024) / 8,
  uploadThroughput: (400 * 1024) / 8,
  latency: 400,
};

const browser = await chromium.launch();
const report = { measuredAt: new Date().toISOString(), runs: {} };

async function timeToInteractive(label, hash, selector, throttle) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('agp-tour-seen', '1'); } catch {}
  });

  if (throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', throttle);
  }

  const started = Date.now();
  await page.goto(BASE + hash);
  // Interactivo = el elemento que el usuario vino a ver existe y esta pintado.
  await page.waitForSelector(selector, { state: 'attached', timeout: 60000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  const ms = Date.now() - started;

  const transferred = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .reduce((sum, e) => sum + (e.transferSize || e.encodedBodySize || 0), 0),
  );

  await context.close();
  return { ms, transferredBytes: transferred };
}

report.runs.homeFast = await timeToInteractive('portada', '', '.catalog__item', null);
report.runs.cardFast = await timeToInteractive('ficha', `${VARIANT}?view=card`, '.waterfall__bar', null);
report.runs.browserFast = await timeToInteractive('navegador', `${VARIANT}?view=signal`, '.browser__canvas', null);

report.runs.homeSlow3G = await timeToInteractive('portada 3G', '', '.catalog__item', SLOW_3G);
report.runs.cardSlow3G = await timeToInteractive('ficha 3G', `${VARIANT}?view=card`, '.waterfall__bar', SLOW_3G);
report.runs.browserSlow3G = await timeToInteractive('navegador 3G', `${VARIANT}?view=signal`, '.browser__canvas', SLOW_3G);

// ---- Frames durante un desplazamiento real --------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('agp-tour-seen', '1'); } catch {}
  });
  await page.goto(`${BASE}${VARIANT}?view=signal`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.browser__canvas');
  await page.waitForTimeout(600);

  const stage = await page.locator('.browser__stage').boundingBox();
  const y = stage.y + stage.height * 0.4;

  // Arrastre en pasos, como lo haria una mano.
  await page.mouse.move(stage.x + stage.width * 0.7, y);
  await page.mouse.down();
  const frames = [];
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(stage.x + stage.width * 0.7 - i * 12, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);

  // El propio visor publica el coste del ultimo frame en su linea de estado.
  const status = await page.locator('.browser__status').innerText();
  const match = /([\d.]+) ms por frame/.exec(status);

  // Zoom con rueda, midiendo cuantos redibujados provoca.
  await page.evaluate(() => {
    window.__draws = 0;
    const observer = new PerformanceObserver(() => {});
    observer.observe({ entryTypes: ['longtask'] });
  });
  const before = Date.now();
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(500);
  const wheelMs = Date.now() - before;

  const memory = await page.evaluate(() =>
    performance.memory
      ? {
          usedJSHeapBytes: performance.memory.usedJSHeapSize,
          totalJSHeapBytes: performance.memory.totalJSHeapSize,
        }
      : null,
  );

  report.runs.interaction = {
    lastFrameMs: match ? Number(match[1]) : null,
    dragSteps: 24,
    wheelSteps: 12,
    wheelTotalMs: wheelMs,
    memory,
    statusLine: status.replace(/\s+/g, ' '),
    frames,
  };
  await context.close();
}

await browser.close();

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

const row = (k, r) =>
  `  ${k.padEnd(16)}${String(r.ms).padStart(6)} ms   ${(r.transferredBytes / 1024).toFixed(0).padStart(6)} KiB`;
console.log('\nTiempo hasta interactivo');
console.log('  vista            tiempo      transferido');
for (const k of ['homeFast', 'cardFast', 'browserFast']) console.log(row(k, report.runs[k]));
console.log('  --- red estrangulada a 3G lento (400 kbps, 400 ms de latencia) ---');
for (const k of ['homeSlow3G', 'cardSlow3G', 'browserSlow3G']) console.log(row(k, report.runs[k]));

const i = report.runs.interaction;
console.log('\nInteraccion');
console.log(`  ultimo frame de render      ${i.lastFrameMs} ms`);
console.log(`  24 pasos de arrastre + 12 de rueda en ${i.wheelTotalMs} ms`);
if (i.memory) {
  console.log(`  heap de JS usado            ${(i.memory.usedJSHeapBytes / 1048576).toFixed(1)} MiB`);
}
console.log(`\nEscrito en ${OUT}`);
