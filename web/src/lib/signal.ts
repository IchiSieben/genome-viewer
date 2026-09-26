/**
 * Decodificador de bloques de senal AGSB.
 *
 * Espejo exacto de `pipeline/src/alphagenome_platform/quantize.py`. Si los dos
 * se separan el visor dibuja basura silenciosamente, asi que el formato se
 * verifica con el magic y con la version, y cualquier desacuerdo lanza.
 */

import { t } from '../i18n';

const MAGIC = 'AGSB';
const SUPPORTED_FORMAT = 1;
const PREFIX_BYTES = 12;

export type Transform = 'linear' | 'log1p';

export interface ArrayHeader {
  scale: number;
  transform: Transform;
  maxAbsError: number;
}

export interface TrackHeader {
  name: string;
  biosample?: string;
  ontologyCurie?: string;
  strand?: string;
  ref: ArrayHeader;
  delta: ArrayHeader;
}

export interface BlockHeader {
  magic: string;
  formatVersion: number;
  schemaVersion: string;
  locus: string;
  level: string;
  modality: string;
  binSize: number;
  length: number;
  interval: { chromosome: string; start: number; end: number };
  layout: string;
  tracks: TrackHeader[];
}

export interface DecodedTrack {
  header: TrackHeader;
  /** Senal de referencia, ya sin cuantizar. */
  ref: Float32Array;
  /** ALT menos REF. Se guarda directo porque recomputarlo pierde precision. */
  delta: Float32Array;
}

export interface DecodedBlock {
  header: BlockHeader;
  tracks: DecodedTrack[];
}

function dequantize(
  source: Int16Array,
  { scale, transform }: ArrayHeader,
): Float32Array {
  const out = new Float32Array(source.length);
  if (transform === 'linear') {
    for (let i = 0; i < source.length; i++) out[i] = source[i]! * scale;
    return out;
  }
  // log1p con signo, inverso exacto del que aplica el pipeline.
  for (let i = 0; i < source.length; i++) {
    const y = source[i]! * scale;
    out[i] = Math.sign(y) * Math.expm1(Math.abs(y));
  }
  return out;
}

/**
 * Decodifica un bloque completo.
 *
 * No copia la carga util: `new Int16Array(buffer, offset, length)` es una vista
 * sobre el mismo ArrayBuffer. Por eso el pipeline rellena la cabecera hasta que
 * el offset sea multiplo de 8; sin esa alineacion esta llamada lanza RangeError.
 */
export function decodeBlock(buffer: ArrayBuffer): DecodedBlock {
  const bytes = new Uint8Array(buffer);
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (magic !== MAGIC) {
    throw new Error(t('error.signal.badMagic', { magic }));
  }

  const view = new DataView(buffer);
  const formatVersion = view.getUint16(4, true);
  if (formatVersion !== SUPPORTED_FORMAT) {
    throw new Error(
      t('error.signal.badFormat', { format: formatVersion, supported: SUPPORTED_FORMAT }),
    );
  }

  const headerLength = view.getUint32(8, true);
  const headerText = new TextDecoder().decode(
    bytes.subarray(PREFIX_BYTES, PREFIX_BYTES + headerLength),
  );
  const header = JSON.parse(headerText) as BlockHeader;

  const payloadStart = PREFIX_BYTES + headerLength;
  if (payloadStart % 2 !== 0) {
    throw new Error(t('error.signal.misaligned', { offset: payloadStart }));
  }

  const { length } = header;
  const expected = header.tracks.length * 2 * length;
  const available = (buffer.byteLength - payloadStart) / 2;
  if (available !== expected) {
    throw new Error(t('error.signal.truncated', { expected, available }));
  }

  const tracks: DecodedTrack[] = header.tracks.map((trackHeader, i) => {
    const refOffset = payloadStart + i * 2 * length * 2;
    const deltaOffset = refOffset + length * 2;
    return {
      header: trackHeader,
      ref: dequantize(new Int16Array(buffer, refOffset, length), trackHeader.ref),
      delta: dequantize(new Int16Array(buffer, deltaOffset, length), trackHeader.delta),
    };
  });

  return { header, tracks };
}

/** Reconstruye ALT. El contrato guarda REF y DELTA, no REF y ALT. */
export function altOf(track: DecodedTrack): Float32Array {
  const out = new Float32Array(track.ref.length);
  for (let i = 0; i < out.length; i++) out[i] = track.ref[i]! + track.delta[i]!;
  return out;
}

/** Extremos de un arreglo, ignorando NaN. Base de cualquier eje. */
export function extent(values: ArrayLike<number>): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return [0, 1];
  return [min, max];
}
