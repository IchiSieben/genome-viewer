/**
 * Number, coordinate and scale formatting, per language.
 *
 * Rule from the brief: every axis with real units. A genomic coordinate with
 * no thousands separator is unreadable, and a PHRED without its reading is a
 * number nobody knows how to read.
 *
 * Quantities follow the reader's language:
 * - Spanish: decimal comma and a narrow no-break space (U+202F) between
 *   thousands, with four-digit numbers left ungrouped, as the RAE and the SI
 *   recommend: `25,96`, `5553`, `262 144`. `Intl.NumberFormat('es')` gets the
 *   decimal and the four-digit rule right but groups with a dot, so its group
 *   separator is swapped after formatting. (`es-PE`, used until 2026-09, is
 *   not an option: CLDR gives it `25.96` and `54,578,515`, English style.)
 * - English: `25.96`, `5,553`, `262,144`.
 *
 * Genomic coordinates are identifiers, not quantities: `chr12:54,578,515`
 * is written the same in both languages, the way UCSC, Ensembl and the
 * literature write it. See `coordinate()`.
 */

import { lang, t } from '../i18n';

const LOCALE = lang === 'es' ? 'es' : 'en';
const NNBSP = '\u202f';

function nf(options: Intl.NumberFormatOptions): (value: number) => string {
  const f = new Intl.NumberFormat(LOCALE, options);
  if (lang !== 'es') return (value) => f.format(value);
  return (value) =>
    f
      .formatToParts(value)
      .map((part) => (part.type === 'group' ? NNBSP : part.value))
      .join('');
}

const INT = nf({ maximumFractionDigits: 0 });
const FIX1 = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
const FIX2 = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FIX3 = nf({ minimumFractionDigits: 3, maximumFractionDigits: 3 });
const FIX4 = nf({ minimumFractionDigits: 4, maximumFractionDigits: 4 });
const SIGNED2 = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' });
const SIGNED4 = nf({ minimumFractionDigits: 4, maximumFractionDigits: 4, signDisplay: 'always' });

/** Coordinates: always English grouping, in every language. */
const COORD = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

/** Integer with thousands separator: `262 144` / `262,144`. */
export function int(value: number): string {
  return INT(value);
}

/** One fixed decimal (legend ticks, frame times). */
export function fixed1(value: number): string {
  return FIX1(value);
}

/** Two fixed decimals, so table columns line up. */
export function fixed2(value: number): string {
  return FIX2(value);
}

/**
 * Two decimals, unless that would turn a residue into a round zero.
 *
 * The weak side of the DNM1 acceptor switch is 0.0058: with two decimals it
 * reads "0.01", exactly the artifact's declared floor, which reads as "not
 * shown" instead of "almost gone". Below the floor, three decimals.
 */
export function residual(value: number): string {
  return value > 0 && value < 0.01 ? FIX3(value) : FIX2(value);
}

/**
 * Four decimals. For the contact diff, where two are not enough: its largest
 * change is 0.0391, and "0.04" loses exactly the digit that makes it
 * comparable with the visible threshold. The smallness IS the result.
 */
export function fixed4(value: number): string {
  return FIX4(value);
}

/** Four decimals, signed. For diff cells, where the sign matters. */
export function signed4(value: number): string {
  return SIGNED4(value);
}

/** Percentage with one decimal: `1,5 %` / `1.5%`. */
export function percent1(fraction: number): string {
  return t('fmt.percent', { value: FIX1(fraction * 100) });
}

/** Two decimals with the sign always visible. For differences and contributions. */
export function signed2(value: number): string {
  return SIGNED2(value);
}

/** Genomic coordinate: `chr12:54,578,515` in both languages (an identifier). */
export function coordinate(chromosome: string, position: number): string {
  return `${chromosome}:${COORD.format(position)}`;
}

/** Closed interval for display. The contract stores 0-based half-open. */
export function intervalLabel(chromosome: string, start: number, end: number): string {
  return `${chromosome}:${COORD.format(start + 1)}-${COORD.format(end)}`;
}

/** Width in bp with the right unit: 1 048 576 bp -> "1,05 Mb" / "1.05 Mb". */
export function span(bp: number): string {
  if (bp >= 1e6) return `${FIX2(bp / 1e6)} Mb`;
  if (bp >= 1e3) return `${FIX2(bp / 1e3)} kb`;
  return `${INT(bp)} ${t('fmt.bp')}`;
}

/** Human-readable bytes. Used on the provenance page and in loading states. */
export function bytes(n: number): string {
  if (n >= 1024 * 1024) return `${FIX2(n / (1024 * 1024))} MiB`;
  if (n >= 1024) return `${FIX2(n / 1024)} KiB`;
  return `${INT(n)} B`;
}

/**
 * Reading of an AVI PHRED.
 *
 * PHRED = -10*log10(1-quantile), so 10 is the top 10 %, 20 the top 1 % and 30
 * the top 0.1 %. Returning the sentence with the number saves the reader from
 * remembering the formula.
 */
export function phredMeaning(phred: number): string {
  if (!Number.isFinite(phred)) return t('fmt.phred.noData');
  const topFraction = Math.pow(10, -phred / 10);
  if (topFraction >= 1) return t('fmt.phred.noSignal');
  const percent = topFraction * 100;
  // With a low PHRED, "top 94 %" is literally true and reads exactly
  // backwards: it looks like a 94th percentile. Above 50 % it is said the
  // other way round.
  if (percent > 50) return t('fmt.phred.belowMedian');
  const digits = percent >= 1 ? 0 : percent >= 0.1 ? 1 : percent >= 0.01 ? 2 : -1;
  const value =
    digits >= 0
      ? nf({ minimumFractionDigits: digits, maximumFractionDigits: digits })(percent)
      : percent.toExponential(1).replace('.', lang === 'es' ? ',' : '.');
  return t('fmt.phred.top', { value });
}

/** Readable ticks of the PHRED axis. */
export const PHRED_TICKS: Array<{ value: number; label: string }> = [
  { value: 0, label: '0' },
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: 40, label: '40' },
];

/** Key of the PHRED axis, on its own line so it does not collide with the ticks. */
export function phredLegend(): string {
  return t('fmt.phred.legend');
}

/** ISO date to something readable, without inventing a time zone. */
export function timestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return (
    new Intl.DateTimeFormat(LOCALE, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(date) + ' UTC'
  );
}

/** Date only (for provenance and "queried on"). */
export function date(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeZone: 'UTC' }).format(d);
}

/** A variant as displayed: `chr12:54,578,515 C>T` (identifier, never localized). */
export function variantLabel(v: {
  chromosome: string;
  position: number;
  ref: string;
  alt: string;
}): string {
  return `${coordinate(v.chromosome, v.position)} ${v.ref}>${v.alt}`;
}

/**
 * Marcas redondas dentro de un intervalo, al estilo de `d3.ticks`.
 *
 * Se escribe a mano en vez de traer `d3-array` (que ademas no publica tipos)
 * porque es lo unico que se necesitaba de la libreria. El paso se elige entre
 * 1, 2 y 5 por potencia de diez, que es lo que da coordenadas genomicas
 * legibles: 54 500 000 y no 54 512 384.
 *
 * @param start Inicio del intervalo.
 * @param stop Fin del intervalo.
 * @param count Numero aproximado de marcas deseadas.
 * @returns Las marcas, en orden ascendente.
 */
export function niceTicks(start: number, stop: number, count: number): number[] {
  if (!(count > 0) || !Number.isFinite(start) || !Number.isFinite(stop)) return [];
  if (start === stop) return [start];

  const span = Math.abs(stop - start);
  const rough = span / count;
  const power = Math.floor(Math.log10(rough));
  const base = Math.pow(10, power);
  const ratio = rough / base;
  const step = (ratio >= 5 ? 10 : ratio >= 2 ? 5 : ratio >= 1 ? 2 : 1) * base;

  const lo = Math.min(start, stop);
  const hi = Math.max(start, stop);
  const first = Math.ceil(lo / step) * step;

  const out: number[] = [];
  // El limite duro evita que un paso degenerado congele la pestana.
  for (let value = first, guard = 0; value <= hi && guard < 1000; value += step, guard++) {
    out.push(Math.round(value * 1e6) / 1e6);
  }
  return out;
}
