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
  StudyDoc,
  TracksDoc,
} from './types';
import { decodeBlock } from './signal';
import type { DecodedBlock } from './signal';

/** Raiz de los datos, relativa al documento para que funcione en subcarpeta. */
const ROOT = 'data/';

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
    throw new SchemaVersionError(
      `El artefacto declara una version de esquema ilegible ("${version}").`,
      url,
    );
  }
  if (major !== SUPPORTED_MAJOR) {
    // Rechazar es lo correcto: renderizar un contrato major distinto produce un
    // grafico plausible y equivocado, que es peor que no mostrar nada.
    throw new SchemaVersionError(
      `Este visor lee el contrato v${SUPPORTED_MAJOR}.x y el artefacto es ` +
        `v${version}. Hay que actualizar el visor o regenerar los datos.`,
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
      throw new DataError('No se pudo contactar el servidor de datos.', url, cause);
    }
    if (!response.ok) {
      throw new DataError(
        `El servidor respondio ${response.status} al pedir este artefacto.`,
        url,
      );
    }
    let document: T;
    try {
      document = (await response.json()) as T;
    } catch (cause) {
      throw new DataError('El artefacto no es JSON valido.', url, cause);
    }
    checkSchemaVersion(document.schemaVersion, url);
    return document;
  })();

  cache.set(url, promise);
  // Un fallo no se cachea: reintentar tiene que poder funcionar.
  promise.catch(() => cache.delete(url));
  return promise;
}

export function loadIndex(): Promise<IndexDoc> {
  return fetchJson<IndexDoc>(`${ROOT}index.json`);
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
      throw new DataError('No se pudo descargar el bloque de senal.', url, cause);
    }
    if (!response.ok) {
      throw new DataError(
        `El servidor respondio ${response.status} al pedir la senal.`,
        url,
      );
    }
    try {
      return decodeBlock(await response.arrayBuffer());
    } catch (cause) {
      throw new DataError(
        cause instanceof Error ? cause.message : 'Bloque de senal ilegible.',
        url,
        cause,
      );
    }
  })();

  cache.set(url, promise);
  promise.catch(() => cache.delete(url));
  return promise;
}
