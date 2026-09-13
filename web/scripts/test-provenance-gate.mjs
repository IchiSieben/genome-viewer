// Prueba que la compuerta de proveniencia del build SEPA DECIR NO.
//
// Una compuerta que nunca se ha visto rechazar nada es fe, no una compuerta. Y
// como la regla esta escrita dos veces (Python y JS), esto tambien comprueba que
// la version de JS no se quedo atras: el caso de la exencion y los tres casos de
// rechazo son los mismos que en `pipeline/tests/test_contract.py`.
//
// Uso: node scripts/test-provenance-gate.mjs
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { checkProvenance } from './check-provenance.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../data/dist');

let fallos = 0;
function comprobar(nombre, condicion, detalle = '') {
  if (condicion) {
    console.log(`  ok    ${nombre}`);
  } else {
    console.error(`  FALLA ${nombre}${detalle ? `  ${detalle}` : ''}`);
    fallos += 1;
  }
}

async function copiaTemporal() {
  const dir = await mkdtemp(join(tmpdir(), 'agp-prov-'));
  const dst = join(dir, 'dist');
  await cp(SRC, dst, { recursive: true });
  return dst;
}

/** Primer archivo con ese nombre bajo `root`. Evita `fs.glob`, aun experimental. */
async function buscar(root, nombre) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      const hit = await buscar(full, nombre);
      if (hit) return hit;
    } else if (entry.name === nombre) {
      return full;
    }
  }
  return null;
}

async function unaFicha(root) {
  const hit = await buscar(root, 'card.json');
  if (!hit) throw new Error('no hay ninguna card.json en data/dist');
  return hit;
}

async function editar(file, cambio) {
  const doc = JSON.parse(await readFile(file, 'utf-8'));
  cambio(doc);
  await writeFile(file, JSON.stringify(doc), 'utf-8');
}

console.log('\ncompuerta de proveniencia (lado del build web)');

// 1. Lo que hay hoy pasa, con como maximo la exencion del estudio planificado.
{
  const { problems, exemptions, seen } = await checkProvenance(SRC);
  comprobar('data/dist pasa', problems.length === 0, problems.join('; '));
  comprobar('hay artefactos que revisar', seen > 0);
  comprobar(
    'como maximo una exencion, y es el manifiesto del estudio',
    exemptions.length <= 1 && exemptions.every((e) => e.includes('manifest.json')),
    exemptions.join('; '),
  );
}

// 2. Una ficha sintetica rompe el build.
{
  const root = await copiaTemporal();
  const ficha = await unaFicha(root);
  await editar(ficha, (d) => { d.provenance.source = 'synthetic'; });
  const { problems } = await checkProvenance(root);
  comprobar(
    'una card.json sintetica se rechaza',
    problems.some((p) => p.includes('card.json') && p.includes('synthetic')),
    problems.join('; '),
  );
  await rm(dirname(root), { recursive: true, force: true });
}

// 3. Un origen inventado que contiene "api" NO se cuela.
{
  const root = await copiaTemporal();
  const ficha = await unaFicha(root);
  await editar(ficha, (d) => { d.provenance.source = 'fake-api'; });
  const { problems } = await checkProvenance(root);
  comprobar(
    "'fake-api' se rechaza (el conjunto es explicito, no una subcadena)",
    problems.some((p) => p.includes('fake-api')),
    problems.join('; '),
  );
  await rm(dirname(root), { recursive: true, force: true });
}

// 4. Un artefacto sin sello se rechaza.
{
  const root = await copiaTemporal();
  const ficha = await unaFicha(root);
  await editar(ficha, (d) => { delete d.provenance; });
  const { problems } = await checkProvenance(root);
  comprobar(
    'sin sello se rechaza',
    problems.some((p) => p.includes('sin sello')),
    problems.join('; '),
  );
  await rm(dirname(root), { recursive: true, force: true });
}

// 5. La exencion del estudio es estrecha: se pierde al declararse concluyente
//    y al traer un panel con numeros.
{
  const root = await copiaTemporal();
  const manifiesto = await buscar(root, 'manifest.json');
  comprobar('existe el manifiesto del estudio', manifiesto !== null);
  if (manifiesto) {
    await editar(manifiesto, (d) => { d.status = 'null'; });
    let r = await checkProvenance(root);
    comprobar(
      'un estudio que se declara concluyente pierde la exencion',
      r.problems.some((p) => p.includes('manifest.json')),
      r.problems.join('; '),
    );

    await editar(manifiesto, (d) => {
      d.status = 'planned';
      d.panels = [{ id: 'x', type: 'bar', title: 't', data: { values: [1, 2, 3] } }];
    });
    r = await checkProvenance(root);
    comprobar(
      'un estudio planificado con numeros pierde la exencion',
      r.problems.some((p) => p.includes('manifest.json')),
      r.problems.join('; '),
    );
  }
  await rm(dirname(root), { recursive: true, force: true });
}

console.log(fallos ? `\n${fallos} comprobaciones fallaron\n` : '\ncompuerta verificada\n');
process.exit(fallos ? 1 : 0);
