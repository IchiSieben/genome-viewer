/**
 * Acceso a los artefactos congelados.
 *
 * La web NUNCA llama a la API de AlphaGenome. La llave es personal e
 * intransferible segun los terminos de uso, asi que no puede vivir en un
 * navegador. Todo lo que se lee aqui son archivos estaticos que el pipeline
 * dejo en `data/dist/`.
 */

import { SUPPORTED_MAJOR } from './types';
import type {
  AnnotationsDoc,
  CardDoc,
  IndexDoc,
  LocusDoc,
  SaturationDoc,
  ContactsDoc,
  SpliceDoc,
  StudyDoc,
  TracksDoc,
} from './types';
import { decodeBlock } from './signal';
import { root, t } from '../i18n';
import type { DecodedBlock } from './signal';

/**
 * Data root, relative to the app root (not to the document): the Spanish shell
 * lives one level down at `/es/`, so `root` is `../` there and `./` in English.
 */
const ROOT = `${root}data/`;

/**
 * Cache en memoria por URL.
 *
 * El cache HTTP ya evita la descarga repetida; esto evita ademas volver a
 * parsear y a decuantizar, que en un bloque de 8192x2x4 valores no es gratis.
 * Se guarda la promesa y no el resultado para que dos peticiones simultaneas
 * del mismo locus compartan una sola descarga.
 */
const cache = new Map<string, Promise<unknown>>();

/** Vacia el cache. Existe para los tests y para el boton de recarga dura. */
export function clearCache(): void {
  cache.clear();
}

export class DataError extends Error {
  constructor(
    message: string,
    readonly url: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DataError';
  }
}

export class SchemaVersionError extends DataError {}

function checkSchemaVersion(version: string, url: string): void {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  if (!Number.isFinite(major)) {
    throw new SchemaVersionError(t('error.schemaUnreadable', { version }), url);
  }
  if (major !== SUPPORTED_MAJOR) {
    // Rechazar es lo correcto: renderizar un contrato major distinto produce un
    // grafico plausible y equivocado, que es peor que no mostrar nada.
    throw new SchemaVersionError(
      t('error.schemaMismatch', { supported: SUPPORTED_MAJOR, version }),
      url,
    );
  }
}

async function fetchJson<T extends { schemaVersion: string }>(url: string): Promise<T> {
  const cached = cache.get(url);
  if (cached) return cached as Promise<T>;

  const promise = (async () => {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (cause) {
      throw new DataError(t('error.network'), url, cause);
    }
    if (!response.ok) {
      throw new DataError(t('error.httpStatus', { status: response.status }), url);
    }
    let document: T;
    try {
      document = (await response.json()) as T;
    } catch (cause) {
      throw new DataError(t('error.invalidJson'), url, cause);
    }
    checkSchemaVersion(document.schemaVersion, url);
    return document;
  })();

  cache.set(url, promise);
  // Un fallo no se cachea: reintentar tiene que poder funcionar.
  promise.catch(() => cache.delete(url));
  return promise;
}

/**
 * Lee el catalogo incrustado en el HTML, si esta.
 *
 * El build lo mete en `<script type="application/json" id="agp-index">`
 * (scripts/inline-index.mjs) para ahorrar un viaje de red. En `vite dev` ese
 * hueco contiene `null` y esto devuelve `null`, con lo que se pide por red.
 *
 * Cualquier problema de forma devuelve `null` en vez de lanzar: el archivo
 * suelto sigue existiendo y es la fuente autoritativa. Pero una version de
 * esquema incompatible SI lanza, igual que por red — ahi el dato existe y es
 * del contrato equivocado, que es un error de verdad y no una ausencia.
 */
function inlineIndex(url: string): IndexDoc | null {
  const node = document.getElementById('agp-index');
  if (!node?.textContent) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(node.textContent);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const document_ = parsed as IndexDoc;
  if (typeof document_.schemaVersion !== 'string') return null;
  checkSchemaVersion(document_.schemaVersion, url);
  return document_;
}

export function loadIndex(): Promise<IndexDoc> {
  const url = `${ROOT}index.json`;
  const cached = cache.get(url);
  if (cached) return cached as Promise<IndexDoc>;

  // Se guarda bajo la MISMA clave que usaria la descarga: asi nadie mas puede
  // acabar pidiendo por red un catalogo que ya esta en la pagina.
  const inline = inlineIndex(url);
  if (inline) {
    const promise = Promise.resolve(inline);
    cache.set(url, promise);
    return promise;
  }
  return fetchJson<IndexDoc>(url);
}

export function loadLocus(path: string): Promise<LocusDoc> {
  return fetchJson<LocusDoc>(`${ROOT}${path}`);
}

export function loadCard(locusPath: string, relative: string): Promise<CardDoc> {
  return fetchJson<CardDoc>(resolveRelative(locusPath, relative));
}

export function loadTracks(locusPath: string, relative: string): Promise<TracksDoc> {
  return fetchJson<TracksDoc>(resolveRelative(locusPath, relative));
}

export function loadAnnotations(
  locusPath: string,
  relative: string,
): Promise<AnnotationsDoc> {
  return fetchJson<AnnotationsDoc>(resolveRelative(locusPath, relative));
}

export function loadSaturation(
  locusPath: string,
  relative: string,
): Promise<SaturationDoc> {
  return fetchJson<SaturationDoc>(resolveRelative(locusPath, relative));
}

export function loadSplice(
  locusPath: string,
  relative: string,
): Promise<SpliceDoc> {
  return fetchJson<SpliceDoc>(resolveRelative(locusPath, relative));
}

export function loadContacts(
  locusPath: string,
  relative: string,
): Promise<ContactsDoc> {
  return fetchJson<ContactsDoc>(resolveRelative(locusPath, relative));
}

export function loadStudy(path: string): Promise<StudyDoc> {
  return fetchJson<StudyDoc>(`${ROOT}${path}`);
}

/**
 * Resuelve una ruta relativa al directorio del locus.
 *
 * Las rutas dentro de `locus.json` son relativas a ese archivo, no a la raiz,
 * para que mover un locus entero de carpeta no obligue a reescribirlas.
 */
export function resolveRelative(locusPath: string, relative: string): string {
  const dir = locusPath.slice(0, locusPath.lastIndexOf('/') + 1);
  return `${ROOT}${dir}${relative}`;
}

/** Descarga y decodifica un bloque de senal. */
export function loadSignal(
  locusPath: string,
  relative: string,
): Promise<DecodedBlock> {
  const url = resolveRelative(locusPath, relative);
  const cached = cache.get(url);
  if (cached) return cached as Promise<DecodedBlock>;

  const promise = (async () => {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (cause) {
      throw new DataError(t('error.signalNetwork'), url, cause);
    }
    if (!response.ok) {
      throw new DataError(t('error.signalHttpStatus', { status: response.status }), url);
    }
    try {
      return decodeBlock(await response.arrayBuffer());
    } catch (cause) {
      throw new DataError(
        cause instanceof Error ? cause.message : t('error.signalUnreadable'),
        url,
        cause,
      );
    }
  })();

  cache.set(url, promise);
  promise.catch(() => cache.delete(url));
  return promise;
}
