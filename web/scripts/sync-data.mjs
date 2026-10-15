// Copia data/dist -> web/public/data para que Vite lo sirva tal cual.
// Se copia en vez de enlazar porque un enlace simbolico no sobrevive al
// empaquetado ni al despliegue por FTP.
import { cp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { gate } from './check-provenance.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../data/dist');
const dst = resolve(here, '../public/data');

if (!existsSync(src)) {
  console.error(`No existe ${src}. Corre primero: python -m alphagenome_platform.cli fixtures`);
  process.exit(1);
}
// La compuerta va ANTES de copiar. Que un artefacto sintetico no llegue a
// `public/` es mas barato que sacarlo despues, y ademas `npm run build` falla
// aqui en vez de producir un `dist/` que se ve bien y miente.
await gate(src, 'data/dist');

await rm(dst, { recursive: true, force: true });
await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log(`data/dist -> web/public/data`);

// ---- stage clouds: data/stage -> web/public/stage --------------------------------------
// Same rule as the gate above, for the stage: only real structures (source rcsb-pdb) reach
// public/. A synthetic cloud is for local integration and never ships.
{
  const { readFileSync } = await import('node:fs');
  const stageSrc = resolve(here, '../../data/stage');
  const stageDst = resolve(here, '../public/stage');
  if (existsSync(stageSrc)) {
    const idx = JSON.parse(readFileSync(resolve(stageSrc, 'index.json'), 'utf8'));
    const bad = idx.structures.filter((s) => s.provenance?.source !== 'rcsb-pdb');
    if (bad.length) {
      console.error(`stage: refusing non-PDB clouds: ${bad.map((s) => s.id).join(', ')}`);
      process.exit(1);
    }
    const posters = resolve(stageDst, 'posters');
    const keep = existsSync(posters);
    if (keep) await cp(posters, resolve(here, '../.posters-tmp'), { recursive: true });
    await rm(stageDst, { recursive: true, force: true });
    await mkdir(stageDst, { recursive: true });
    await cp(stageSrc, stageDst, { recursive: true });
    if (keep) {
      await cp(resolve(here, '../.posters-tmp'), posters, { recursive: true });
      await rm(resolve(here, '../.posters-tmp'), { recursive: true, force: true });
    }
    console.log(`data/stage -> web/public/stage (${idx.structures.length} structures)`);
  }
}
