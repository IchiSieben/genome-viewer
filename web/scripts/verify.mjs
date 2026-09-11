// Verificacion del build servido desde una SUBCARPETA, no desde la raiz.
//
// Comprueba cuatro cosas que no se ven mirando el codigo:
//   1. cero errores y advertencias de consola,
//   2. cero peticiones fallidas (un 404 de asset rompe el demo en produccion),
//   3. **cero peticiones fuera del host**, que es como se verifica la regla de
//      que la web nunca llama a la API de AlphaGenome,
//   4. que cada vista pinte de verdad los elementos que dice pintar, en tema
//      claro y oscuro y a ancho de movil.
//
// Uso:
//   npm run build
//   node scripts/verify.mjs [directorio-de-capturas]
//
// Espera un servidor estatico sirviendo el build en
// http://127.0.0.1:8099/alphagenome/ (ver npm run verify).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8099/alphagenome/';
const OUT = process.argv[2] || 'shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
let failures = 0;

async function visit(name, hash, { width = 1280, height = 900, theme = 'light', checks = [] } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const badRequests = [];
  const external = [];

  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => badRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url()}`);
    const u = new URL(r.url());
    if (!u.hostname.startsWith('127.0.0.1')) external.push(r.url());
  });

  await page.goto(BASE + hash, { waitUntil: 'networkidle' });
  // El recorrido de introduccion tapa la pagina; se descarta para las capturas.
  await page.evaluate(() => {
    try { localStorage.setItem('agp-tour-seen', '1'); } catch {}
    document.querySelector('.tour')?.remove();
  });
  await page.waitForTimeout(350);

  const results = [];
  for (const { selector, min = 1, label } of checks) {
    const count = await page.locator(selector).count();
    const ok = count >= min;
    if (!ok) failures++;
    results.push(`${ok ? 'OK  ' : 'FALLA'} ${label ?? selector}: ${count} (min ${min})`);
  }

  const scroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  if (scroll) { failures++; results.push('FALLA la pagina se desplaza en horizontal'); }

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

  if (consoleErrors.length) failures++;
  if (badRequests.length) failures++;
  if (external.length) failures++;

  console.log(`\n=== ${name}  [${width}x${height}, tema ${theme}] ===`);
  for (const r of results) console.log('  ' + r);
  console.log(`  consola: ${consoleErrors.length ? consoleErrors.join(' | ') : 'limpia'}`);
  console.log(`  red:     ${badRequests.length ? badRequests.join(' | ') : 'sin fallos'}`);
  console.log(`  externo: ${external.length ? external.join(' | ') : 'ninguna peticion fuera del host'}`);

  await context.close();
}

await visit('01-portada', '', {
  checks: [
    { selector: '.catalog__item', min: 4, label: 'items de catalogo (3 loci + 1 estudio)' },
    { selector: '.hero__title', label: 'titulo' },
  ],
});

await visit('02-locus', '#/locus/ppp1r1a-pde1b', {
  checks: [
    { selector: '.catalog__item', min: 3, label: 'variantes' },
    { selector: '.card__chip', min: 3, label: 'chips de metadatos' },
  ],
});

await visit('03-ficha-variante', '#/variant/ppp1r1a-pde1b/chr12-54578515-T-C?view=card', {
  checks: [
    { selector: '.gauge', label: 'medidor AVI' },
    { selector: '.waterfall__bar', min: 18, label: 'barras de la cascada SHAP' },
    { selector: '.waterfall__family', min: 4, label: 'encabezados de familia' },
    { selector: '.family-summary__row', min: 4, label: 'filas de resumen por familia' },
    { selector: '.track-list__row', min: 10, label: 'tracks destacados' },
    { selector: '.provenance--synthetic', label: 'aviso de datos sinteticos' },
  ],
});

await visit('04-ficha-oscuro', '#/variant/ppp1r1a-pde1b/chr12-54578515-T-C?view=card', {
  theme: 'dark',
  checks: [
    { selector: '.waterfall__bar', min: 18, label: 'barras de la cascada SHAP' },
    { selector: '.gauge', label: 'medidor AVI' },
  ],
});

await visit('05-mapa-calor', '#/variant/ppp1r1a-pde1b/chr12-54578515-T-C?view=tracks', {
  checks: [
    { selector: '.heatmap__cell', min: 300, label: 'celdas del mapa' },
    { selector: '.heatmap__group-label', min: 8, label: 'grupos por sistema de organos' },
    { selector: '.heatmap__col-label', min: 11, label: 'columnas de modalidad' },
    { selector: '.legend', label: 'leyenda' },
  ],
});

await visit('06-mapa-calor-oscuro', '#/variant/ppp1r1a-pde1b/chr12-54578515-T-C?view=tracks', {
  theme: 'dark',
  checks: [{ selector: '.heatmap__cell', min: 300, label: 'celdas del mapa' }],
});

await visit('07-estudio', '#/study/atlas-andino', {
  checks: [
    { selector: '.status--planned', label: 'estado declarado' },
    { selector: '.honesty__limits li', min: 5, label: 'limitaciones declaradas' },
    { selector: '.facts__pair', min: 6, label: 'pares de hechos' },
  ],
});

await visit('08-movil-mapa', '#/variant/ppp1r1a-pde1b/chr12-54578515-T-C?view=tracks', {
  width: 390,
  height: 844,
  checks: [{ selector: '.heatmap-scroll', label: 'contenedor con desplazamiento propio' }],
});

await visit('09-movil-ficha', '#/variant/ppp1r1a-pde1b/chr12-54578515-T-C?view=card', {
  width: 390,
  height: 844,
  checks: [{ selector: '.waterfall__bar', min: 18, label: 'barras de la cascada' }],
});

await visit('10-sobre-los-datos', '#/about', {
  checks: [{ selector: '.facts dd', min: 4, label: 'hechos del contrato' }],
});

await visit('11-navegador', '#/variant/ppp1r1a-pde1b/chr12-54578515-T-C?view=signal', {
  checks: [
    { selector: '.browser__canvas', label: 'canvas de senal' },
    { selector: '.browser__overlay', label: 'overlay SVG' },
    { selector: '.chip', min: 4, label: 'chips de modalidad' },
    { selector: '.browser__tick-label', min: 3, label: 'marcas del eje' },
    { selector: '.browser__lane-label', min: 4, label: 'etiquetas de lane' },
    { selector: '.browser__exon', min: 4, label: 'exones' },
    { selector: '.browser__gene-label', min: 1, label: 'nombres de gen' },
  ],
});

await visit('12-navegador-oscuro', '#/variant/ppp1r1a-pde1b/chr12-54578515-T-C?view=signal', {
  theme: 'dark',
  checks: [{ selector: '.browser__canvas', label: 'canvas de senal' }],
});

await visit('13-navegador-movil', '#/variant/ppp1r1a-pde1b/chr12-54578515-T-C?view=signal', {
  width: 390,
  height: 844,
  checks: [{ selector: '.browser__canvas', label: 'canvas de senal' }],
});

await browser.close();
console.log(`\n${failures === 0 ? 'TODO OK' : failures + ' FALLAS'}`);
process.exit(failures === 0 ? 0 : 1);
