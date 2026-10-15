// Verifica el sitio DESPLEGADO, no el build local.
// Uso: node scripts/verify-live.mjs https://dominio/genome-viewer/
// Recorre los dos idiomas y las dos capas: portada (/, /es/) y visor (app/, es/app/), los dos temas,
// movil a 400 px y 3G lento. Falla con cualquier error de consola (incluidas
// violaciones de la CSP del vhost), cualquier 4xx/5xx y cualquier peticion
// fuera del propio host.
import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'https://ichisieben.dev/genome-viewer/').replace(/\/?$/, '/');
const VARIANT = 'ppp1r1a-pde1b/chr12-54578515-C-T';
const SLOW_3G = {
  offline: false,
  downloadThroughput: (400 * 1024) / 8,
  uploadThroughput: (400 * 1024) / 8,
  latency: 400,
};

const browser = await chromium.launch();
let failures = 0;
const robots = [];

async function visit(
  name,
  hash,
  selector,
  { throttle = null, min = 1, lang = 'en', app = true, theme = 'light', width = 1280, height = 900 } = {},
) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('agp-tour-seen', '1'); } catch {}
  });
  const errors = [];
  const bad = [];
  const external = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
    const host = new URL(r.url()).hostname;
    if (host !== new URL(BASE).hostname) external.push(host);
  });
  if (throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', throttle);
  }
  const t0 = Date.now();
  const doc = await page.goto(BASE + (lang === 'es' ? 'es/' : '') + (app ? 'app/' : '') + hash, { timeout: 120000 });
  robots.push(doc?.headers()['x-robots-tag'] ?? '');
  const htmlLang = await page.evaluate(() => document.documentElement.lang).catch(() => '');
  if (htmlLang !== lang) errors.push(`<html lang="${htmlLang}">, se esperaba ${lang}`);
  let count = 0;
  try {
    await page.waitForSelector(selector, { state: 'attached', timeout: 45000 });
    count = await page.locator(selector).count();
  } catch { /* se reporta abajo */ }
  const ms = Date.now() - t0;
  const ok = count >= min && !errors.length && !bad.length && !external.length;
  if (!ok) failures++;
  console.log(
    `  ${ok ? 'OK   ' : 'FALLA'} ${name.padEnd(26)} ${String(ms).padStart(5)} ms  ` +
    `${selector} x${count}` +
    (errors.length ? `  consola: ${errors[0]}` : '') +
    (bad.length ? `  red: ${bad[0]}` : '') +
    (external.length ? `  EXTERNO: ${[...new Set(external)].join(',')}` : ''),
  );
  await context.close();
}

console.log(`\n=== sitio desplegado: ${BASE} ===`);
await visit('escenario', '', '.st-block', { app: false, min: 3 });
await visit('escenario es', '', '.st-block', { app: false, min: 3, lang: 'es' });
await visit('escenario es 400px', '', '.st-block', { app: false, min: 3, lang: 'es', theme: 'dark', width: 400, height: 800 });
await visit('visor', '', '.catalog__item', { min: 4 });
await visit('visor es', '', '.catalog__item', { min: 4, lang: 'es' });
await visit('visor es oscuro 400px', '', '.mini-cascade', { lang: 'es', theme: 'dark', width: 400, height: 800 });
await visit('ficha oscuro 400px', `#/variant/${VARIANT}?view=card`, '.waterfall__bar', { min: 18, theme: 'dark', width: 400, height: 800 });
await visit('sashimi es', '#/variant/dnm1/chr9-128226027-G-A?view=splice', '.sashimi__plot', { lang: 'es' });
await visit('contactos oscuro', '#/variant/celsr2-psrc1/chr1-109274968-G-T?view=contact', '.contacts__canvas', { theme: 'dark' });
await visit('por que es', '#/why', '.prose--long p', { min: 6, lang: 'es' });
await visit('referencias', '#/references', '.reference', { min: 13 });
await visit('ficha de variante', `#/variant/${VARIANT}?view=card`, '.waterfall__bar', { min: 18 });
await visit('tejido x modalidad', `#/variant/${VARIANT}?view=tracks`, '.heatmap__cell', { min: 200 });
await visit('navegador de tracks', `#/variant/${VARIANT}?view=signal`, '.browser__canvas');
await visit('mapa de saturacion', `#/variant/${VARIANT}?view=saturation`, '.saturation__canvas');
await visit('estudio', '#/study/atlas-andino', '.honesty__limits li', { min: 5 });
await visit('comparador es', '#/compare?a=ppp1r1a-pde1b%2Fchr12-54578515-C-T', '.compare-side .gauge', { min: 2, lang: 'es' });

console.log('\n  --- red estrangulada a 3G lento ---');
await visit('escenario 3G', '', '.st-block', { throttle: SLOW_3G, min: 3, app: false });
await visit('escenario es 3G', '', '.st-block', { throttle: SLOW_3G, min: 3, app: false, lang: 'es' });
await visit('visor 3G', '', '.catalog__item', { throttle: SLOW_3G, min: 4 });
await visit('ficha 3G', `#/variant/${VARIANT}?view=card`, '.waterfall__bar', { throttle: SLOW_3G, min: 18 });
await visit('navegador 3G', `#/variant/${VARIANT}?view=signal`, '.browser__canvas', { throttle: SLOW_3G });
await visit('visor es 3G', '', '.catalog__item', { throttle: SLOW_3G, min: 4, lang: 'es' });

// Primera subida sin indexar: la cabecera X-Robots-Tag viene del .htaccess
// del visor. Si falta, el hosting no lee ese .htaccess y hay que saberlo.
// AGP_EXPECT_NOINDEX=0 after the build with AGP_NOINDEX=0: then NO document may carry it.
const expectNoindex = (process.env.AGP_EXPECT_NOINDEX ?? '1') === '1';
const tagged = robots.filter((r) => /noindex/i.test(r)).length;
const robotsOk = expectNoindex ? tagged === robots.length : tagged === 0;
if (!robotsOk) failures++;
console.log(`\n  ${robotsOk ? 'OK   ' : 'FALLA'} X-Robots-Tag noindex en ${tagged}/${robots.length} documentos (esperado: ${expectNoindex ? 'todos' : 'ninguno'})`);

await browser.close();
console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLAS`);
process.exit(failures === 0 ? 0 : 1);
