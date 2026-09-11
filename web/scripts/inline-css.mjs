// Mete el CSS dentro del HTML tras el build.
//
// Por que: la hoja de estilos bloquea el renderizado y viaja en su propia
// peticion. Con 400 ms de latencia eso es un viaje entero antes de que se
// pueda pintar nada, y son solo ~5 kB comprimidos. Incrustarla cambia un
// viaje de ida y vuelta por unos kilobytes en un archivo que ya se estaba
// descargando.
//
// Solo merece la pena por debajo de un tope: incrustar 100 kB de CSS haria que
// el HTML dejara de cachearse por separado y seria peor.
import { readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '../dist');
const MAX_INLINE_BYTES = 64 * 1024;

const htmlPath = join(DIST, 'index.html');
let html = await readFile(htmlPath, 'utf-8');

const link = /<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/.exec(html);
if (!link) {
  console.log('inline-css: no hay hoja de estilos que incrustar');
  process.exit(0);
}

const href = link[1].replace(/^\.\//, '');
const cssPath = join(DIST, href);
const css = await readFile(cssPath, 'utf-8');

if (css.length > MAX_INLINE_BYTES) {
  console.log(
    `inline-css: ${css.length} B supera el tope de ${MAX_INLINE_BYTES} B; se deja aparte`,
  );
  process.exit(0);
}

html = html.replace(link[0], `<style>${css}</style>`);
await writeFile(htmlPath, html, 'utf-8');
// El archivo suelto ya no lo pide nadie.
await rm(cssPath, { force: true });

console.log(`inline-css: ${css.length} B incrustados; un viaje de red menos`);
