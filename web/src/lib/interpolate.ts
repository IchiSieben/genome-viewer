/**
 * Interpolacion de color entre paradas.
 *
 * Se escribe a mano en vez de traer `d3-interpolate` porque son treinta lineas
 * y porque los colores llegan como texto resuelto desde `getComputedStyle`, que
 * siempre devuelve `rgb(...)` o `#rrggbb`: no hace falta un parser general de
 * CSS color.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parse(color: string): Rgb {
  const text = color.trim();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex?.[1]) {
    const body = hex[1];
    if (body.length === 3) {
      return {
        r: parseInt(body[0]! + body[0]!, 16),
        g: parseInt(body[1]! + body[1]!, 16),
        b: parseInt(body[2]! + body[2]!, 16),
      };
    }
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
    };
  }

  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }

  // Un color que no se reconoce se devuelve como gris medio en vez de romper el
  // dibujo entero: un grafico en gris es legible, un canvas vacio no.
  return { r: 128, g: 128, b: 128 };
}

/** Interpola dos colores en espacio sRGB. */
export function interpolateRgb(a: string, b: string): (t: number) => string {
  const from = parse(a);
  const to = parse(b);
  return (t: number) => {
    const k = Math.max(0, Math.min(1, t));
    const r = Math.round(from.r + (to.r - from.r) * k);
    const g = Math.round(from.g + (to.g - from.g) * k);
    const bl = Math.round(from.b + (to.b - from.b) * k);
    return `rgb(${r}, ${g}, ${bl})`;
  };
}

/**
 * Encadena interpoladores sobre una lista de paradas.
 *
 * `piecewise(interpolateRgb, [c0, c1, c2])(t)` recorre c0 -> c1 -> c2 con t en
 * [0, 1], que es lo que hace falta para una rampa divergente de siete paradas.
 */
export function piecewise(
  interpolate: (a: string, b: string) => (t: number) => string,
  stops: string[],
): (t: number) => string {
  if (stops.length === 0) return () => 'rgb(128, 128, 128)';
  if (stops.length === 1) return () => stops[0]!;

  const segments = stops.slice(0, -1).map((stop, i) => interpolate(stop, stops[i + 1]!));
  const n = segments.length;

  return (t: number) => {
    const k = Math.max(0, Math.min(1, t));
    const scaled = k * n;
    const index = Math.min(n - 1, Math.floor(scaled));
    return segments[index]!(scaled - index);
  };
}
