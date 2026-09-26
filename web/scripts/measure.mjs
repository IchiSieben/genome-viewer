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
const BASE = process.env.AGP_BASE_URL || 'http://127.0.0.1:8099/genome-viewer/';
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

async function timeToInteractive(label, hash, selector, throttle, viewport) {
  const context = await browser.newContext({
    viewport: viewport ?? { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('agp-tour-seen', '1'); } catch {}
    // CLS acumulado desde el primer byte. `buffered` recoge tambien los
    // desplazamientos que ocurrieron antes de que este observador existiera.
    window.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.hadRecentInput) window.__cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
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

  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const rows = performance.getEntriesByType('resource').map((e) => ({
      name: e.name.replace(location.origin, '').replace(/^\/[^/]+\//, ''),
      start: Math.round(e.startTime),
      end: Math.round(e.responseEnd),
      bytes: e.transferSize || e.encodedBodySize || 0,
      initiator: e.initiatorType,
    }));
    return {
      documentEnd: nav ? Math.round(nav.responseEnd) : 0,
      rows: rows.sort((a, b) => a.start - b.start),
    };
  });

  const transferred = timing.rows.reduce((sum, r) => sum + r.bytes, 0);
  // CLS: se deja asentar la pagina (animaciones de entrada incluidas) antes de
  // leerlo. Un desplazamiento que llega despues de "interactivo" tambien cuenta.
  await page.waitForTimeout(1500);
  const cls = await page.evaluate(() => Math.round((window.__cls || 0) * 10000) / 10000);
  await context.close();
  return {
    ms,
    cls,
    transferredBytes: transferred,
    documentEndMs: timing.documentEnd,
    requests: timing.rows,
    waves: waves(timing),
  };
}

/**
 * Profundidad de cadena: cuantos viajes de red hay EN SERIE antes de pintar.
 *
 * Es el numero que manda con 400 ms de latencia, y NO se puede leer del codigo
 * con confianza: hay que medirlo. Una peticion abre oleada nueva si arranca
 * DESPUES de que acabara la ultima de la oleada anterior; si arranca antes, iba
 * en paralelo y no cuesta un viaje extra. El umbral de 120 ms absorbe el jitter
 * del emulador sin llegar a fundir dos oleadas separadas por 400 ms de latencia.
 *
 * El documento HTML cuenta como primera oleada: tambien es un viaje.
 */
function waves(timing) {
  const TOLERANCE_MS = 120;
  const groups = [];
  let frontier = timing.documentEnd;
  let current = null;
  for (const row of timing.rows) {
    if (!current || row.start > frontier + TOLERANCE_MS) {
      if (current) frontier = current.end;
      current = { end: row.end, names: [row.name] };
      groups.push(current);
    } else {
      current.names.push(row.name);
      current.end = Math.max(current.end, row.end);
    }
  }
  return {
    depth: groups.length + 1,
    detail: [
      { names: ['index.html'], endMs: timing.documentEnd },
      ...groups.map((g) => ({ names: g.names, endMs: g.end })),
    ],
  };
}

// La portada se mide DOS VECES a proposito, con dos selectores que no son la
// misma cosa.
//
// `.catalog__item` es el selector con el que se midio la portada antes del
// heroe, cuando el catalogo era lo primero de la pagina. Se conserva para que
// el antes/despues sea comparable, pero ojo: ahora el catalogo esta DEBAJO del
// heroe, asi que ese numero ya no mide "cuando el visitante ve algo", mide
// "cuando termina de montarse el listado". Son dos preguntas distintas.
//
// `.hero__featured .gauge` es lo que de verdad importa desde el encargo de la
// portada: el momento en que hay una variante real dibujada arriba del todo.
// Ese elemento espera a `card.json`, que el catalogo no espera, asi que es el
// numero honesto para el heroe y va a salir mas alto. Los dos se reportan.
report.runs.homeFast = await timeToInteractive('portada', '', '.catalog__item', null);
report.runs.homeHeroFast = await timeToInteractive(
  'portada heroe', '', '.hero__featured .gauge', null,
);
report.runs.cardFast = await timeToInteractive('ficha', `${VARIANT}?view=card`, '.waterfall__bar', null);
report.runs.browserFast = await timeToInteractive('navegador', `${VARIANT}?view=signal`, '.browser__canvas', null);

report.runs.homeSlow3G = await timeToInteractive('portada 3G', '', '.catalog__item', SLOW_3G);
report.runs.homeHeroSlow3G = await timeToInteractive(
  'portada heroe 3G', '', '.hero__featured .gauge', SLOW_3G,
);
report.runs.cardSlow3G = await timeToInteractive('ficha 3G', `${VARIANT}?view=card`, '.waterfall__bar', SLOW_3G);
report.runs.browserSlow3G = await timeToInteractive('navegador 3G', `${VARIANT}?view=signal`, '.browser__canvas', SLOW_3G);

// CLS en movil: el hueco reservado del heroe y el pie son los que mas se
// mueven en pantalla estrecha, asi que la portada y la ficha se repiten a 400 px.
const MOBILE = { width: 400, height: 720 };
report.runs.homeMobile = await timeToInteractive('portada movil', '', '.hero__featured .gauge', null, MOBILE);
report.runs.cardMobile = await timeToInteractive('ficha movil', `${VARIANT}?view=card`, '.waterfall__bar', null, MOBILE);

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
  // El coste del frame se lee de un atributo, no del texto: el texto cambia
  // con el idioma. El texto se conserva como respaldo para builds antiguos.
  const frameAttr = await page.locator('.browser__status').getAttribute('data-frame-ms');
  const match = frameAttr ? [null, frameAttr] : /([\d.,]+) ms/.exec(status);

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
    lastFrameMs: match ? Number(String(match[1]).replace(',', '.')) : null,
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
  `  ${k.padEnd(16)}${String(r.ms).padStart(6)} ms   ` +
  `${(r.transferredBytes / 1024).toFixed(0).padStart(6)} KiB   ` +
  `${String(r.waves.depth).padStart(5)} saltos   CLS ${r.cls.toFixed(4)}`;
console.log('\nTiempo hasta interactivo');
console.log('  vista            tiempo      transferido   en serie');
for (const k of ['homeFast', 'homeHeroFast', 'cardFast', 'browserFast'])
  console.log(row(k, report.runs[k]));
console.log('  --- red estrangulada a 3G lento (400 kbps, 400 ms de latencia) ---');
for (const k of ['homeSlow3G', 'homeHeroSlow3G', 'cardSlow3G', 'browserSlow3G'])
  console.log(row(k, report.runs[k]));
console.log('  --- movil 400x720, red rapida ---');
for (const k of ['homeMobile', 'cardMobile']) console.log(row(k, report.runs[k]));

// El desglose de la cadena es lo que permite ver QUE viaje sobra. Sin esto el
// numero de saltos es una cifra sin agarre.
console.log('\nCadena en 3G lento: oleadas EN SERIE, con lo que trae cada una');
for (const k of ['homeSlow3G', 'homeHeroSlow3G', 'cardSlow3G', 'browserSlow3G']) {
  console.log(`  ${k}`);
  for (const [n, w] of report.runs[k].waves.detail.entries()) {
    const names =
      w.names.length > 4
        ? `${w.names.slice(0, 4).join(', ')} +${w.names.length - 4} mas`
        : w.names.join(', ');
    console.log(`    ${n + 1}. hasta ${String(w.endMs).padStart(5)} ms   ${names}`);
  }
}

const i = report.runs.interaction;
console.log('\nInteraccion');
console.log(`  ultimo frame de render      ${i.lastFrameMs} ms`);
console.log(`  24 pasos de arrastre + 12 de rueda en ${i.wheelTotalMs} ms`);
if (i.memory) {
  console.log(`  heap de JS usado            ${(i.memory.usedJSHeapBytes / 1048576).toFixed(1)} MiB`);
}
console.log(`\nEscrito en ${OUT}`);
