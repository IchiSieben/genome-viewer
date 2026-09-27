// Verifica N2 (enlace cruzado) y N3 (estado en la URL).
//
// Son las dos cosas que convierten una galeria de graficos en una herramienta,
// y las dos se rompen en silencio: un enlace que no navega y una URL que no
// refleja el estado no lanzan ningun error.
//
// Uso: node scripts/serve-subfolder.mjs --run "node scripts/verify-links.mjs"

import { chromium } from 'playwright';

const BASE = process.env.AGP_BASE_URL || 'http://127.0.0.1:8099/genome-viewer/';
const VARIANT = 'ppp1r1a-pde1b/chr12-54578515-C-T';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
const page = await context.newPage();
await page.addInitScript(() => {
  try { localStorage.setItem('agp-tour-seen', '1'); } catch {}
});

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${label}${detail ? `  ${detail}` : ''}`);
}

async function settle(ms = 900) {
  await page.waitForTimeout(ms);
}

// --- N3: la URL lleva las modalidades y la ventana -------------------------
console.log('\n=== N3: estado en la URL ===');
await page.goto(`${BASE}#/variant/${VARIANT}?view=signal`, { waitUntil: 'networkidle' });
await settle();

let hash = await page.evaluate(() => location.hash);
check('la vista publica tracks y ventana en la URL',
  /tracks=/.test(hash) && /win=\d+-\d+/.test(hash), hash.slice(0, 90));

// Cambiar la seleccion tiene que reflejarse en la URL.
const chips = page.locator('.chip--on');
const before = await chips.count();
const chipNames = await page.locator('.chip').allInnerTexts();
console.log('  info  chips:', JSON.stringify(chipNames));
// Se elige por ESTADO, no por posicion: las ultimas fichas son acciones
// ("Ir a la variante", "Ver locus completo") y pincharlas no cambia la
// seleccion. El indice fijo apuntaba a una de ellas.
const offChip = page.locator('.chip:not(.chip--on):not(.chip--action)').first();
await offChip.evaluate((n) => n.scrollIntoView({ block: 'center' }));
await settle(200);
const offName = (await offChip.getAttribute('data-modality')) || '';
await offChip.click();
await settle();
hash = await page.evaluate(() => location.hash);
const after = await page.locator('.chip--on').count();
check(
  'elegir una modalidad cambia la URL',
  after === before + 1 && hash.includes(offName),
  `${offName}: ${before} -> ${after}`,
);

// Una URL con estado tiene que reabrir exactamente esa pantalla.
const shared = `${BASE}#/variant/${VARIANT}?view=signal&tracks=DNASE&win=54578000-54579000`;
await page.goto(shared, { waitUntil: 'networkidle' });
await settle(1200);
const status = await page.locator('.browser__status').innerText();
const onChips = await page.locator('.chip--on').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-modality')));
check('un enlace compartido restaura la modalidad',
  onChips.length === 1 && onChips[0] === 'DNASE', JSON.stringify(onChips));
check('un enlace compartido restaura la ventana',
  /1[.,]00 kb|1\.00 kb|54,578,00/.test(status), status.replace(/\s+/g, ' ').slice(0, 80));

// --- N2: enlace cruzado ----------------------------------------------------
console.log('\n=== N2: enlace cruzado ===');

// V1 -> V3 pinchando un feature regulatorio.
await page.goto(`${BASE}#/variant/${VARIANT}?view=card`, { waitUntil: 'networkidle' });
await settle();
const linked = await page.locator('.waterfall__row--linked').count();
check('la cascada tiene filas enlazables', linked >= 6, `${linked} filas`);

// La cabecera es pegajosa: hay que centrar el elemento antes de pinchar, o
// queda debajo de ella.
await page.locator('.waterfall__row--linked').first().evaluate((n) =>
  n.scrollIntoView({ block: 'center' }),
);
await settle(300);
await page.locator('.waterfall__row--linked').first().click();
await settle(1200);
hash = await page.evaluate(() => location.hash);
check('pinchar un feature abre el navegador con esa modalidad',
  hash.includes('view=signal') && hash.includes('tracks='), hash.slice(0, 90));
check('el navegador se dibujo tras el salto',
  (await page.locator('.browser__canvas').count()) === 1);

// V2 -> V3 pinchando una celda del mapa de calor.
await page.goto(`${BASE}#/variant/${VARIANT}?view=tracks`, { waitUntil: 'networkidle' });
await settle();
await page.locator('.heatmap__cell').nth(20).evaluate((n) =>
  n.scrollIntoView({ block: 'center' }),
);
await settle(300);
await page.locator('.heatmap__cell').nth(20).click();
await settle(1200);
hash = await page.evaluate(() => location.hash);
check('pinchar una celda abre el navegador con esa modalidad',
  hash.includes('view=signal') && hash.includes('tracks='), hash.slice(0, 90));

// Mapa de saturacion -> ficha, para una variante que SI esta congelada.
await page.goto(`${BASE}#/variant/${VARIANT}?view=saturation`, { waitUntil: 'networkidle' });
await settle(1200);
// Las coordenadas se CALCULAN desde la geometria de la vista, no se adivinan
// desde el centro del contenedor: la rejilla empieza despues de la columna de
// etiquetas, y a ~3 px por columna adivinar falla por varias posiciones.
const target = await page.evaluate(() => {
  const stage = document.querySelector('.saturation__stage');
  const rect = stage.getBoundingClientRect();
  const LABEL = 34, RIGHT = 8, GENE = 32, SUMMARY = 14, ROW = 26;
  const columns = 512;
  const plot = Math.max(200, rect.width - LABEL - RIGHT);
  const cw = plot / columns;
  // La variante congelada es C>T en el foco, que es la columna del centro.
  // Columna del foco: posicion 1-based menos el inicio 0-based del intervalo.
  const column = 54578515 - 1 - 54578259;
  const row = 3; // A, C, G, T -> T
  return {
    x: rect.left + LABEL + column * cw + cw / 2,
    y: rect.top + GENE + SUMMARY + row * ROW + ROW / 2,
  };
});
await page.mouse.click(target.x, target.y);
await settle(900);
hash = await page.evaluate(() => location.hash);
// Hay dos desenlaces validos y los dos cuentan. Si la variante esta congelada
// se navega a su ficha, y entonces el propio mapa ya no esta en el DOM: leer su
// linea de estado sin comprobarlo hacia fallar la prueba justo cuando el enlace
// funcionaba.
const navigated = hash.includes('view=card');
const readout = navigated
  ? ''
  : await page.locator('.saturation__readout').innerText();
check('pinchar el mapa de saturacion responde',
  navigated || readout.includes('AVI PHRED'),
  (navigated ? `navego a ${hash}` : readout).slice(0, 95));
if (navigated) {
  check('la ficha de esa variante se dibujo',
    (await page.locator('.waterfall__bar').count()) >= 18);
}

// N4: la ficha enlaza al comparador; los selectores y el intercambio viven
// en la URL, y un enlace compartido restaura la misma pareja.
await page.goto(`${BASE}#/variant/${VARIANT}?view=card`, { waitUntil: 'networkidle' });
await settle();
await page.locator('.tabs__compare').click();
await settle(1200);
const cmpHash = await page.evaluate(() => decodeURIComponent(location.hash));
check('la ficha abre el comparador con ella como A',
  cmpHash.startsWith('#/compare?a=') && cmpHash.includes(VARIANT),
  cmpHash);
await page.waitForSelector('.compare-side[data-side="b"] .gauge', { timeout: 60000 }).catch(() => {});
check('el comparador dibuja A y B',
  (await page.locator('.compare-side').count()) === 2);
const [selA, selB] = await Promise.all([
  page.locator('select[data-side="a"]').inputValue(),
  page.locator('select[data-side="b"]').inputValue(),
]);
check('A y B son distintas', selA !== selB, `${selA} / ${selB}`);
await page.locator('.compare-picker__swap').click();
await page.waitForFunction((b) => document.querySelector('select[data-side="a"]')?.value === b, selB, { timeout: 60000 }).catch(() => {});
const swapped = await page.evaluate(() => location.href);
check('intercambiar A y B cambia la URL',
  (await page.locator('select[data-side="a"]').inputValue()) === selB);
await page.goto('about:blank');
await page.goto(swapped, { waitUntil: 'networkidle' });
await page.waitForSelector('select[data-side="a"]', { timeout: 60000 }).catch(() => {});
await settle(600);
check('un enlace compartido restaura la pareja',
  (await page.locator('select[data-side="a"]').inputValue()) === selB &&
  (await page.locator('select[data-side="b"]').inputValue()) === selA);

console.log(`\nerrores de consola: ${errors.length ? errors.join(' | ') : 'ninguno'}`);
if (errors.length) failures++;
await browser.close();
console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLAS`);
process.exit(failures === 0 ? 0 : 1);
