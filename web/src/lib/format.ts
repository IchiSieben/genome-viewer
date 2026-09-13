/**
 * Formato de numeros, coordenadas y escalas.
 *
 * Regla del encargo: cada eje con unidades reales. Una coordenada genomica sin
 * separadores de millar es ilegible, y un PHRED sin su interpretacion es un
 * numero que nadie sabe leer.
 */

const ES = 'es-PE';

const INT = new Intl.NumberFormat(ES, { maximumFractionDigits: 0 });
const FIX2 = new Intl.NumberFormat(ES, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const SIGNED2 = new Intl.NumberFormat(ES, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'always',
});

/** Entero con separador de millar: 54 578 515. */
export function int(value: number): string {
  return INT.format(value);
}

/** Dos decimales fijos, para que las columnas de una tabla se alineen. */
export function fixed2(value: number): string {
  return FIX2.format(value);
}

const FIX3 = new Intl.NumberFormat(ES, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/**
 * Dos decimales, salvo cuando eso convertiria un residuo en un cero redondo.
 *
 * El lado debil del intercambio de aceptor de DNM1 vale 0,0058: con dos
 * decimales sale "0.01", que es justo el piso declarado del artefacto y se lee
 * como "esto no se mostro" en vez de "esto casi desaparecio". Por debajo del
 * piso se pasa a tres decimales.
 */
export function residual(value: number): string {
  return value > 0 && value < 0.01 ? FIX3.format(value) : FIX2.format(value);
}

const FIX4 = new Intl.NumberFormat(ES, {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const SIGNED4 = new Intl.NumberFormat(ES, {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
  signDisplay: 'always',
});

/**
 * Cuatro decimales. Para el diff de contactos, donde dos no bastan.
 *
 * El cambio maximo que mide V5 vale 0,0391: con dos decimales sale "0.04", que
 * pierde justo la cifra que permite compararlo con el umbral visible. La
 * pequenez del numero ES el resultado, asi que el numero tiene que poder
 * escribirse entero.
 */
export function fixed4(value: number): string {
  return FIX4.format(value);
}

/** Cuatro decimales con signo. Para celdas de un diff, donde el signo manda. */
export function signed4(value: number): string {
  return SIGNED4.format(value);
}

/** Porcentaje con un decimal. Para "el cambio es el 1,5 % del relieve". */
export function percent1(fraction: number): string {
  return `${FIX1.format(fraction * 100)} %`;
}

const FIX1 = new Intl.NumberFormat(ES, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Dos decimales con signo siempre visible. Para diferencias y contribuciones. */
export function signed2(value: number): string {
  return SIGNED2.format(value);
}

/**
 * Coordenada genomica. `chr12:54 578 515`.
 *
 * El separador de millar es el que hace legible un numero de ocho cifras. Sin
 * el, comparar dos posiciones exige contar digitos con el dedo.
 */
export function coordinate(chromosome: string, position: number): string {
  return `${chromosome}:${int(position)}`;
}

/** Intervalo cerrado para mostrar. El contrato guarda 0-based semiabierto. */
export function intervalLabel(chromosome: string, start: number, end: number): string {
  return `${chromosome}:${int(start + 1)}-${int(end)}`;
}

/** Ancho en pb con la unidad que corresponda: 1 048 576 pb -> "1,05 Mb". */
export function span(bp: number): string {
  if (bp >= 1e6) return `${FIX2.format(bp / 1e6)} Mb`;
  if (bp >= 1e3) return `${FIX2.format(bp / 1e3)} kb`;
  return `${int(bp)} pb`;
}

/** Bytes legibles. Se usa en la pagina de proveniencia y en los estados de carga. */
export function bytes(n: number): string {
  if (n >= 1024 * 1024) return `${FIX2.format(n / (1024 * 1024))} MiB`;
  if (n >= 1024) return `${FIX2.format(n / 1024)} KiB`;
  return `${int(n)} B`;
}

/**
 * Interpretacion de un PHRED del AVI.
 *
 * PHRED = -10*log10(1-cuantil), asi que 10 es el 10 % superior, 20 el 1 % y 30
 * el 0,1 %. Devolver la frase junto al numero evita que el lector tenga que
 * recordar la formula.
 */
export function phredMeaning(phred: number): string {
  if (!Number.isFinite(phred)) return 'sin dato';
  const topFraction = Math.pow(10, -phred / 10);
  if (topFraction >= 1) return 'sin senal';
  const percent = topFraction * 100;
  // Con un PHRED bajo, "top 94 %" es literalmente cierto y se lee justo al
  // reves de lo que significa: parece un percentil 94. Por debajo del 50 % de
  // corte se dice en positivo cuanta variacion queda por encima.
  if (percent > 50) {
    return `por debajo de la mediana del genoma`;
  }
  if (percent >= 1) return `en el ${percent.toFixed(0)} % mas alto`;
  if (percent >= 0.1) return `en el ${percent.toFixed(1)} % mas alto`;
  if (percent >= 0.01) return `en el ${percent.toFixed(2)} % mas alto`;
  return `en el ${percent.toExponential(1)} % mas alto`;
}

/** Marcas interpretables del eje PHRED. */
export const PHRED_TICKS: Array<{ value: number; label: string }> = [
  { value: 0, label: '0' },
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: 40, label: '40' },
];

/** Clave del eje PHRED, en una linea aparte para que no choque con las marcas. */
export const PHRED_LEGEND = '10 = 10 % mas alto · 20 = 1 % · 30 = 0,1 % · 40 = 0,01 %';

/** Fecha ISO a algo legible, sin inventar zona horaria. */
export function timestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(ES, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date) + ' UTC';
}

/** Texto de una variante tal como se muestra: `chr12:54 578 515 C>T`. */
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
