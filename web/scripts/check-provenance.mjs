// Compuerta de proveniencia del lado del build web.
//
// Por que existe si ya hay una en Python: `npm run build` es lo que produce
// `web/dist/`, que es lo que se sube. Si la unica compuerta viviera en
// `cli validate`, bastaria olvidarse de correrlo para desplegar un artefacto
// sintetico. Esta corre sola, dentro de `npm run sync`, antes de copiar nada.
//
// La REGLA es la misma que en `pipeline/src/alphagenome_platform/contract.py`
// (`API_SOURCES` y `_non_api_exemption`). Si se cambia aqui hay que cambiarla
// alli, y al reves: son dos implementaciones de un solo contrato, declarado en
// docs/02-data-contract.md.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

// Conjunto EXPLICITO, no una prueba de subcadena. Con `source.includes('api')`
// bastaria llamar al origen "fake-api" para colarse.
export const API_SOURCES = new Set(['atlas-api', 'model-api']);

/** Clasifica un archivo por tipo de artefacto, igual que `iter_dist`. */
function kindOf(name) {
  switch (name) {
    case 'index.json':
      return 'index';
    case 'locus.json':
      return 'locus';
    case 'card.json':
      return 'card';
    case 'tracks.json':
      return 'tracks';
    case 'manifest.json':
      return 'study';
    case 'annotations.json':
      return 'annotations';
    case 'saturation.json':
      return 'saturation';
    case 'splice.json':
      return 'splice';
    case 'contacts.json':
      return 'contacts';
    default:
      return null;
  }
}

/**
 * Unica excepcion permitida: la ficha de un estudio PLANIFICADO sin numeros.
 *
 * Publicar el plan de un estudio antes de correrlo es lo que este proyecto dice
 * querer hacer. Lo que no vale es que ese documento lleve cifras inventadas, ni
 * que se declare concluyente.
 */
function nonApiExemption(kind, doc) {
  if (kind !== 'study') return null;
  if (doc.status !== 'planned') return null;
  const panels = doc.panels ?? [];
  if (panels.some((p) => p.type !== 'note')) return null;
  return `estudio 'planned' con ${panels.length} panel(es) de tipo 'note' y ningun numero`;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** Revisa un arbol de artefactos. Devuelve `{ problems, exemptions, seen }`. */
export async function checkProvenance(root) {
  const problems = [];
  const exemptions = [];
  let seen = 0;

  for await (const file of walk(root)) {
    const kind = kindOf(file.split(sep).pop());
    if (!kind) continue;
    const label = relative(root, file).split(sep).join('/');
    let doc;
    try {
      doc = JSON.parse(await readFile(file, 'utf-8'));
    } catch (cause) {
      problems.push(`${label}: no es JSON valido (${cause.message})`);
      continue;
    }
    const prov = doc.provenance;
    if (!prov) {
      problems.push(`${label}: sin sello de proveniencia`);
      continue;
    }
    seen += 1;
    if (API_SOURCES.has(prov.source)) continue;
    const reason = nonApiExemption(kind, doc);
    if (reason) {
      exemptions.push(`${label}: origen '${prov.source}', permitido porque es ${reason}`);
      continue;
    }
    problems.push(
      `${label}: declara origen '${prov.source}', que no es de la API ` +
        `(${[...API_SOURCES].sort().join(', ')})`,
    );
  }

  if (!seen && !problems.length) {
    problems.push(`${root} no tiene ningun artefacto con sello`);
  }
  return { problems, exemptions, seen };
}

/** Revisa y termina el proceso si hay problemas. */
export async function gate(root, where) {
  const { problems, exemptions, seen } = await checkProvenance(root);
  if (problems.length) {
    console.error(`\nproveniencia: ${where} NO puede desplegarse.\n`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      '\nUn artefacto sintetico desplegado se ve exactamente igual que uno\n' +
        'real: ni 404 ni error de consola. Regenera con\n' +
        '  PYTHONPATH=pipeline/src python -m alphagenome_platform.cli build-locus\n' +
        'o saca el artefacto de data/dist/. La unica excepcion permitida es la\n' +
        "ficha de un estudio 'planned' sin ningun numero.\n",
    );
    process.exit(1);
  }
  console.log(`proveniencia: ${seen} artefactos, todos de la API`);
  for (const line of exemptions) console.log(`  excepcion -> ${line}`);
}
