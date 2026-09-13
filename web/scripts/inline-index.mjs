// Mete el catalogo (data/index.json) dentro del HTML tras el build.
//
// Mismo razonamiento que inline-css.mjs, aplicado a datos en vez de estilos:
// con 400 ms de latencia, un viaje de red cuesta mas que los 978 B del
// manifiesto. El archivo suelto NO se borra —a diferencia del CSS— porque
// sigue siendo un artefacto del contrato, con su sello de proveniencia, y
// `vite dev` lo pide por red.
//
// Este paso tambien es lo que permite que el script del <head> conozca la
// variante destacada: sin el manifiesto incrustado no habria nada que leer
// antes de que llegara el bundle.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '../dist');
const MAX_INLINE_BYTES = 16 * 1024;

// El hueco esta en index.html con `null` dentro, no vacio: en `vite dev` nadie
// corre este script y `JSON.parse('null')` es valido. Un hueco vacio seria un
// error de parseo en desarrollo.
const SLOT = '<script type="application/json" id="agp-index">null</script>';

const htmlPath = join(DIST, 'index.html');
let html = await readFile(htmlPath, 'utf-8');

if (!html.includes(SLOT)) {
  console.error(
    'inline-index: no encuentro el hueco del manifiesto en dist/index.html.\n' +
      `  esperaba exactamente: ${SLOT}\n` +
      '  si se edito index.html, hay que actualizar SLOT aqui.',
  );
  process.exit(1);
}

// Se lee del dist servido, no de ../../data/dist: asi lo que se incrusta es
// exactamente el byte que se despliega, y no una copia que pudo quedar vieja.
const raw = await readFile(join(DIST, 'data', 'index.json'), 'utf-8');

if (raw.length > MAX_INLINE_BYTES) {
  // No es un aviso decorativo: a partir de cierto tamano el manifiesto deja de
  // cachearse por separado y cada despliegue reenvia el HTML completo.
  console.error(
    `inline-index: el manifiesto pesa ${raw.length} B y el tope es ${MAX_INLINE_BYTES} B. ` +
      'Con un catalogo asi ya conviene pedirlo por red; hay que quitar este paso, ' +
      'no subir el tope sin medir.',
  );
  process.exit(1);
}

// Dentro de un <script> el HTML no interpreta entidades, pero SI corta el
// elemento en la primera secuencia `</script`. Escapar `<` lo hace imposible y
// sigue siendo JSON valido.
const safe = raw.trim().replace(/</g, '\\u003c');
html = html.replace(
  SLOT,
  `<script type="application/json" id="agp-index">${safe}</script>`,
);

// El script del <head> no sirve de nada si el bundle se ejecuta antes. La
// posicion la decide Vite al inyectar su <script type="module">, asi que se
// comprueba sobre el HTML ya construido en vez de confiar en el orden fuente.
const moduleAt = html.search(/<script[^>]+type="module"/);
const bootAt = html.indexOf('id="agp-boot"');
const slotAt = html.indexOf('id="agp-index"');
if (moduleAt < 0 || bootAt < 0 || slotAt < 0) {
  console.error('inline-index: falta el bundle, el script de precarga o el manifiesto.');
  process.exit(1);
}
if (!(slotAt < bootAt && bootAt < moduleAt)) {
  console.error(
    'inline-index: el orden en el <head> quedo mal. Tiene que ser ' +
      'manifiesto -> script de precarga -> bundle, y quedo ' +
      `${slotAt} -> ${bootAt} -> ${moduleAt}. Sin ese orden la precarga no ` +
      'adelanta nada.',
  );
  process.exit(1);
}

await writeFile(htmlPath, html, 'utf-8');
console.log(
  `inline-index: ${raw.length} B de catalogo incrustados; la precarga precede al bundle`,
);
