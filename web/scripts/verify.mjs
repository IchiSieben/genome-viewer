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
// http://127.0.0.1:8099/genome-viewer/ (ver npm run verify).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AGP_BASE_URL || 'http://127.0.0.1:8099/genome-viewer/';
const OUT = process.argv[2] || 'shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
let failures = 0;

async function visit(name, hash, { width = 1280, height = 900, theme = 'light', checks = [], sourceWarn = false, lang = 'en' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: theme,
    // Screenshots are taken with motion reduced: a full-page capture never
    // scrolls, so scroll-in entries would stay hidden below the fold. Motion
    // itself is checked separately below (checkMotion).
    reducedMotion: 'reduce',
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

  // English lives at the root, Spanish one level down at es/ (build-shells.mjs).
  await page.goto(BASE + (lang === 'es' ? 'es/' : '') + hash, { waitUntil: 'networkidle', timeout: 120000 });
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

  const declared = await page.evaluate(() => document.documentElement.lang);
  if (declared !== lang) {
    failures++;
    results.push(`FALLA <html lang="${declared}">, se esperaba "${lang}"`);
  }
  // A key without translation is printed as the key itself: never "a.b.c".
  const rawKeys = await page.evaluate(() =>
    (document.body.innerText.match(/\b[a-z]+\.[a-z][A-Za-z]*\.[a-zA-Z.]+\b/g) || [])
      .filter((s) => !/^(www|ichisieben|github)\./.test(s)),
  );
  if (rawKeys.length) {
    failures++;
    results.push(`FALLA claves sin traducir en pantalla: ${rawKeys.slice(0, 5).join(', ')}`);
  }

  const scroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  if (scroll) { failures++; results.push('FALLA la pagina se desplaza en horizontal'); }

  // Toda vista declara de donde salieron sus numeros, y lo declara ARRIBA. Esto
  // no se comprueba por vista sino aqui, para que una vista nueva que se olvide
  // del sello falle sola sin que nadie tenga que acordarse de anadir el check.
  const chips = await page.locator('.source-chip').count();
  if (!chips) {
    failures++;
    results.push('FALLA sin marca de origen (.source-chip) en la vista');
  } else {
    const warn = await page.locator('.source-chip--warn').count();
    const texts = [...new Set(await page.locator('.source-chip__text').allInnerTexts())];
    // Con `data/dist` real, un aviso ambar significa que se colo un artefacto
    // que no viene de la API. La excepcion es la ficha del estudio planificado,
    // donde el aviso es la respuesta CORRECTA: ahi se EXIGE, no se dispensa.
    if (sourceWarn && !warn) {
      failures++;
      results.push(`FALLA se esperaba aviso de origen y no hay: ${texts.join(' | ')}`);
    } else if (!sourceWarn && warn) {
      failures++;
      results.push(`FALLA marca de origen en aviso: ${texts.join(' | ')}`);
    } else {
      results.push(
        `OK   marca de origen${sourceWarn ? ' (aviso esperado)' : ''}: ${texts.join(' | ')}`,
      );
    }
  }

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

await visit('03-ficha-variante', '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=card', {
  checks: [
    { selector: '.gauge', label: 'medidor AVI' },
    { selector: '.waterfall__bar', min: 18, label: 'barras de la cascada SHAP' },
    { selector: '.waterfall__family', min: 4, label: 'encabezados de familia' },
    { selector: '.family-summary__row', min: 4, label: 'filas de resumen por familia' },
    { selector: '.track-list__row', min: 6, label: 'tracks destacados' },
    { selector: '.gauge-block__legend', label: 'clave del eje PHRED' },
    { selector: '.provenance', label: 'sello de proveniencia' },
  ],
});

await visit('04-ficha-oscuro', '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=card', {
  theme: 'dark',
  checks: [
    { selector: '.waterfall__bar', min: 18, label: 'barras de la cascada SHAP' },
    { selector: '.gauge', label: 'medidor AVI' },
  ],
});

await visit('05-mapa-calor', '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=tracks', {
  checks: [
    { selector: '.heatmap__cell', min: 300, label: 'celdas del mapa' },
    { selector: '.heatmap__group-label', min: 8, label: 'grupos por sistema de organos' },
    { selector: '.heatmap__col-label', min: 11, label: 'columnas de modalidad' },
    { selector: '.legend', label: 'leyenda' },
  ],
});

await visit('06-mapa-calor-oscuro', '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=tracks', {
  theme: 'dark',
  checks: [{ selector: '.heatmap__cell', min: 300, label: 'celdas del mapa' }],
});

// La ficha del estudio planificado es el UNICO artefacto que no viene de la API
// (ver la compuerta en docs/02-data-contract.md). Aqui se exige que lo grite: si
// algun dia trae numeros reales y sigue en ambar, o al contrario deja de avisar
// siendo sintetico, esto falla.
await visit('07-estudio', '#/study/atlas-andino', {
  sourceWarn: true,
  checks: [
    { selector: '.status--planned', label: 'estado declarado' },
    { selector: '.honesty__limits li', min: 5, label: 'limitaciones declaradas' },
    { selector: '.facts__pair', min: 6, label: 'pares de hechos' },
  ],
});

await visit('08-movil-mapa', '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=tracks', {
  width: 390,
  height: 844,
  checks: [{ selector: '.heatmap-scroll', label: 'contenedor con desplazamiento propio' }],
});

await visit('09-movil-ficha', '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=card', {
  width: 390,
  height: 844,
  checks: [{ selector: '.waterfall__bar', min: 18, label: 'barras de la cascada' }],
});

await visit('10-sobre-los-datos', '#/about', {
  checks: [{ selector: '.facts dd', min: 4, label: 'hechos del contrato' }],
});

await visit('11-navegador', '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=signal', {
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

await visit('12-navegador-oscuro', '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=signal', {
  theme: 'dark',
  checks: [{ selector: '.browser__canvas', label: 'canvas de senal' }],
});

await visit('13-navegador-movil', '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=signal', {
  width: 390,
  height: 844,
  checks: [{ selector: '.browser__canvas', label: 'canvas de senal' }],
});

await visit('14-saturacion', '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=saturation', {
  checks: [
    { selector: '.saturation__canvas', label: 'canvas del mapa' },
    { selector: '.saturation__row-label', min: 5, label: 'etiquetas de fila A C G T + ref' },
    { selector: '.saturation__tick-label', min: 3, label: 'marcas del eje' },
    { selector: '.saturation__focus', label: 'marca de la variante' },
    { selector: '.legend', label: 'leyenda' },
  ],
});

await visit('15-saturacion-oscuro', '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=saturation', {
  theme: 'dark',
  checks: [{ selector: '.saturation__canvas', label: 'canvas del mapa' }],
});

await visit('16-saturacion-movil', '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=saturation', {
  width: 390,
  height: 844,
  checks: [{ selector: '.saturation__canvas', label: 'canvas del mapa' }],
});

await visit('17-sashimi', '#/variant/dnm1/chr9-128226027-G-A?view=splice', {
  checks: [
    { selector: '.sashimi__plot', label: 'svg del sashimi' },
    { selector: '.sashimi__arc', min: 5, label: 'arcos de union' },
    { selector: '.sashimi__lane-label', min: 2, label: 'etiquetas REF/ALT' },
    { selector: '.sashimi__variant-mark', label: 'marca de la variante' },
    { selector: '.legend', label: 'leyenda de grosor' },
    { selector: '.card__chip', min: 1, label: 'chip de biosample' },
    // El resalte es la respuesta a que las etiquetas caian en arcos
    // constitutivos: sin esto, nada impide que vuelva a pasar en silencio.
    // Seis y no cuatro: son las CUATRO uniones reciprocas, pero de dos de
    // ellas solo se dibuja el lado REF porque su ALT (0,006) queda bajo el
    // piso de 0,01. Que el numero exacto este aqui es el punto: si cambia,
    // alguien tiene que mirar por que.
    { selector: '.sashimi__arc--touching', min: 6, label: 'arcos que tocan la variante' },
    { selector: '.sashimi__arc--muted', min: 10, label: 'arcos atenuados' },
    // Las etiquetas van por |ALT - REF|: las dos uniones reciprocas de DNM1
    // tienen que quedar escritas, mas una sola sobre el arco constitutivo
    // mayor como referencia de escala.
    { selector: '.sashimi__label', min: 5, label: 'etiquetas directas' },
    { selector: '.finding__text', label: 'el hallazgo redactado' },
    { selector: '.finding__table tbody tr', min: 4, label: 'filas medidas del hallazgo' },
  ],
});

await visit('18-sashimi-oscuro', '#/variant/dnm1/chr9-128226027-G-A?view=splice', {
  theme: 'dark',
  checks: [{ selector: '.sashimi__plot', label: 'svg del sashimi' }],
});

await visit('19-sashimi-movil', '#/variant/dnm1/chr9-128226027-G-A?view=splice', {
  width: 390,
  height: 844,
  checks: [{ selector: '.sashimi__plot', label: 'svg del sashimi' }],
});

const CONTACTOS = '#/variant/celsr2-psrc1/chr1-109274968-G-T?view=contact';

await visit('20-contactos', CONTACTOS, {
  checks: [
    { selector: '.contacts__canvas', label: 'lienzo del diff' },
    // El veredicto va ANTES del mapa: cuando el resultado es "no cambia
    // nada", el numero tiene que llegar antes que el color.
    { selector: '.contacts__verdict-lead', label: 'cambio maximo declarado' },
    { selector: '.contacts__verdict-detail', min: 2, label: 'detalle medido' },
    // DOS leyendas: la estructura tiene escala propia y el diff la fija. Si
    // alguna vez se fundieran en una, el diff heredaria un dominio que sale
    // de los datos, que es justo lo que esta vista no puede hacer.
    { selector: '.contacts__legend', min: 2, label: 'leyenda de cada mitad' },
    // Las dos marcas del maximo observado, una a cada lado del cero. Son lo
    // que hace VISIBLE la pequenez en vez de solo escribirla.
    { selector: '.contacts__mark', min: 2, label: 'marca del maximo en la leyenda' },
    { selector: '.contacts__magnify', label: 'boton de magnificacion etiquetado' },
    { selector: '.contacts__bridge-text', min: 2, label: 'puente con el numero del AVI' },
    { selector: '.contacts__biosample', label: 'aviso de linea celular' },
    { selector: '.finding__text', label: 'el hallazgo redactado' },
    { selector: '.source-chip', min: 1, label: 'chip de origen' },
  ],
});

await visit('21-contactos-oscuro', CONTACTOS, {
  theme: 'dark',
  checks: [{ selector: '.contacts__canvas', label: 'lienzo del diff' }],
});

await visit('22-contactos-movil', CONTACTOS, {
  width: 390,
  height: 844,
  checks: [{ selector: '.contacts__canvas', label: 'lienzo del diff' }],
});

// ---- Spanish: the same views through the /es/ shell -----------------------
const V = '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T';
await visit('es-01-portada', '', {
  lang: 'es',
  checks: [
    { selector: '.catalog__item', min: 4, label: 'items de catalogo' },
    { selector: '.hero__featured .gauge', label: 'medidor del heroe' },
  ],
});
await visit('es-03-ficha', `${V}?view=card`, {
  lang: 'es',
  checks: [{ selector: '.waterfall__bar', min: 18, label: 'barras de la cascada' }],
});
await visit('es-04-ficha-oscuro-movil', `${V}?view=card`, {
  lang: 'es', theme: 'dark', width: 400, height: 800,
  checks: [{ selector: '.waterfall__bar', min: 18, label: 'barras de la cascada' }],
});
await visit('es-05-mapa-calor', `${V}?view=tracks`, {
  lang: 'es',
  checks: [{ selector: '.heatmap__cell', min: 300, label: 'celdas del mapa' }],
});
await visit('es-11-navegador', `${V}?view=signal`, {
  lang: 'es',
  checks: [{ selector: '.browser__canvas', label: 'canvas de senal' }],
});
await visit('es-14-saturacion', `${V}?view=saturation`, {
  lang: 'es',
  checks: [{ selector: '.saturation__canvas', label: 'canvas del mapa' }],
});
await visit('es-17-sashimi', '#/variant/dnm1/chr9-128226027-G-A?view=splice', {
  lang: 'es',
  checks: [{ selector: '.sashimi__plot', label: 'svg del sashimi' }],
});
await visit('es-20-contactos-oscuro', CONTACTOS, {
  lang: 'es', theme: 'dark',
  checks: [{ selector: '.contacts__canvas', label: 'lienzo del diff' }],
});
await visit('es-07-estudio', '#/study/atlas-andino', {
  lang: 'es', sourceWarn: true,
  checks: [{ selector: '.status--planned', label: 'estado declarado' }],
});
await visit('es-10-sobre-los-datos', '#/about', {
  lang: 'es',
  checks: [{ selector: '.facts dd', min: 4, label: 'hechos del contrato' }],
});

// Narrative pages (phase 3): every paragraph, milestone, fact and reference.
await visit('23-por-que', '#/why', {
  checks: [{ selector: '.prose--long p', min: 6, label: 'párrafos' }],
});
await visit('24-hoja-de-ruta', '#/roadmap', {
  checks: [{ selector: '.milestone', min: 22, label: 'hitos y compuertas' }],
});
await visit('25-como-esta-hecho', '#/how', {
  checks: [{ selector: '.facts dd', min: 8, label: 'datos y herramientas' }],
});
await visit('26-referencias', '#/references', {
  checks: [{ selector: '.reference', min: 13, label: 'referencias' }],
});
await visit('es-23-por-que-oscuro-movil', '#/why', {
  lang: 'es', theme: 'dark', width: 400, height: 800,
  checks: [{ selector: '.prose--long p', min: 6, label: 'párrafos' }],
});
await visit('es-24-hoja-de-ruta', '#/roadmap', {
  lang: 'es',
  checks: [{ selector: '.milestone', min: 22, label: 'hitos y compuertas' }],
});
await visit('es-26-referencias', '#/references', {
  lang: 'es',
  checks: [{ selector: '.reference', min: 13, label: 'referencias' }],
});

// Motion ON: the hero draws, scroll entries end visible, nothing is left at
// opacity 0 after scrolling to the bottom, and the catalog digests fill in.
async function checkMotion(lang) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('agp-tour-seen', '1'); } catch {} });
  await page.goto(BASE + (lang === 'es' ? 'es/' : ''), { waitUntil: 'networkidle', timeout: 120000 });
  const results = [];
  const check = (ok, label) => { results.push(`${ok ? '  OK   ' : '  FALLA'} ${label}`); if (!ok) failures++; };
  check(await page.evaluate(() => document.documentElement.classList.contains('motion')), 'clase motion sin reduced-motion');
  await page.waitForSelector('.mini-cascade', { timeout: 60000 });
  check((await page.locator('.mini-cascade__bar').count()) >= 6, 'cascada del heroe con 6+ barras');
  // Scroll to the bottom in steps, like a reader.
  for (let y = 0; y < 8000; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('.panel, .reveal, .hero__lead, .hero__featured')]
      .filter((n) => Number(getComputedStyle(n).opacity) < 0.99).length,
  );
  check(hidden === 0, `nada queda invisible tras bajar hasta el pie (${hidden})`);
  await page
    .waitForFunction(() => document.querySelectorAll('.catalog__digest .mini-phred').length >= 9, null, { timeout: 60000 })
    .catch(() => {});
  const digests = await page.locator('.catalog__digest .mini-phred').count();
  check(digests >= 9, `medidores del catalogo llenos (${digests})`);
  for (const icon of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', `og-${lang}.png`]) {
    const res = await page.request.get(BASE + icon);
    check(res.ok(), `${icon} existe`);
  }
  check(errors.length === 0, `sin errores de consola${errors.length ? ': ' + errors.join(' | ') : ''}`);
  console.log(`\nmovimiento (${lang})`);
  for (const r of results) console.log(r);
  await context.close();
}
await checkMotion('en');
await checkMotion('es');

// N6: the track search filters heatmap rows, ignores accents, shows an empty
// state for no match, and Esc brings every row back.
async function checkSearch(lang, query) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('agp-tour-seen', '1'); } catch {} });
  await page.goto(BASE + (lang === 'es' ? 'es/' : '') + '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=tracks', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector('.heatmap__row-label', { timeout: 60000 });
  const results = [];
  const check = (ok, label) => { results.push(`${ok ? '  OK   ' : '  FALLA'} ${label}`); if (!ok) failures++; };
  const rows = () => page.locator('.heatmap__row-label').count();
  const all = await rows();
  const input = page.locator('.heatmap-search__input');
  await input.fill(query);
  await page.waitForTimeout(400);
  const some = await rows();
  check(some > 0 && some < all, `"${query}" deja ${some} de ${all} filas`);
  check((await page.locator('.heatmap-search__count').textContent())?.includes(String(some)), 'el recuento coincide con las filas');
  await input.fill('zzqx-sin-resultado');
  await page.waitForTimeout(400);
  check((await rows()) === 0 && (await page.locator('.state--empty').count()) > 0, 'sin coincidencias: estado vacio');
  await input.press('Escape');
  await page.waitForTimeout(200);
  check((await rows()) === all, 'Esc devuelve todas las filas');
  check(errors.length === 0, `sin errores de consola${errors.length ? ': ' + errors.join(' | ') : ''}`);
  console.log(`\nbuscador de tracks (${lang})`);
  for (const r of results) console.log(r);
  await context.close();
}
await checkSearch('en', 'liver');
await checkSearch('es', 'musculo');

await browser.close();
console.log(`\n${failures === 0 ? 'TODO OK' : failures + ' FALLAS'}`);
process.exit(failures === 0 ? 0 : 1);
