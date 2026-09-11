// Copia data/dist -> web/public/data para que Vite lo sirva tal cual.
// Se copia en vez de enlazar porque un enlace simbolico no sobrevive al
// empaquetado ni al despliegue por FTP.
import { cp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../data/dist');
const dst = resolve(here, '../public/data');

if (!existsSync(src)) {
  console.error(`No existe ${src}. Corre primero: python -m alphagenome_platform.cli fixtures`);
  process.exit(1);
}
await rm(dst, { recursive: true, force: true });
await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log(`data/dist -> web/public/data`);
