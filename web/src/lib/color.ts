/**
 * Escalas de color, derivadas de los tokens CSS.
 *
 * Ninguna vista define un color propio: todas piden aqui, y aqui se lee el
 * token del DOM. Asi el cambio de tema alcanza tambien al canvas, que no
 * entiende `var(--x)`.
 *
 * Familias, no modalidades
 * ------------------------
 * Hay once modalidades de salida y la paleta categorica tiene ocho ranuras.
 * Ciclar seria darle el mismo color a dos series, asi que las modalidades se
 * agrupan en SIETE familias y cada familia ocupa una ranura fija. La ranura 8
 * queda libre a proposito: es roja y compite con el color de estado critico.
 *
 * La asignacion es por ENTIDAD, no por posicion: filtrar modalidades no
 * repinta a las que quedan.
 */

import { interpolateRgb, piecewise } from './interpolate';
import { token } from './dom';
import { t, has } from '../i18n';

/** Las 11 modalidades reales de `dna_output.OutputType`. */
export const MODALITY_ORDER = [
  'RNA_SEQ',
  'CAGE',
  'PROCAP',
  'ATAC',
  'DNASE',
  'CHIP_TF',
  'CHIP_HISTONE',
  'SPLICE_SITES',
  'SPLICE_SITE_USAGE',
  'SPLICE_JUNCTIONS',
  'POLYADENYLATION',
  'CONTACT_MAPS',
] as const;

export type ModalityFamily =
  | 'expression'
  | 'accessibility'
  | 'tf-binding'
  | 'histone'
  | 'splicing'
  | 'chromatin-3d'
  | 'polyadenylation';

/** Modalidad -> familia. Siete familias en ocho ranuras. */
export const MODALITY_FAMILY: Record<string, ModalityFamily> = {
  RNA_SEQ: 'expression',
  CAGE: 'expression',
  PROCAP: 'expression',
  ATAC: 'accessibility',
  DNASE: 'accessibility',
  CHIP_TF: 'tf-binding',
  CHIP_HISTONE: 'histone',
  SPLICE_SITES: 'splicing',
  SPLICE_SITE_USAGE: 'splicing',
  SPLICE_JUNCTIONS: 'splicing',
  CONTACT_MAPS: 'chromatin-3d',
  POLYADENYLATION: 'polyadenylation',
};

/** Familia -> ranura categorica. Fija. */
const FAMILY_SLOT: Record<ModalityFamily, number> = {
  expression: 1,
  accessibility: 2,
  'tf-binding': 3,
  histone: 4,
  splicing: 5,
  'chromatin-3d': 6,
  polyadenylation: 7,
};

/** Etiqueta legible de una familia de modalidad. Funcion, no tabla: `t()` no
 * se puede llamar a nivel de modulo. */
export function familyLabelModality(family: ModalityFamily): string {
  return t(`legend.modalityFamily.${family}`);
}

/** Color de una ranura categorica, de 1 a 8. */
export function slotColor(slot: number): string {
  const clamped = Math.min(8, Math.max(1, Math.round(slot)));
  return token(`--cat-${clamped}`);
}

/** Color categorico de una modalidad, via su familia. */
export function modalityColor(modality: string): string {
  const family = MODALITY_FAMILY[modality];
  return family ? slotColor(FAMILY_SLOT[family]) : token('--ink-faint');
}

/**
 * Patron de trazo por familia, como canal NO cromatico.
 *
 * La validacion de la paleta mide que con ocho categorias ninguna combinacion
 * se separa bien en las tres dicromacias. La regla que lo compensa es que la
 * identidad nunca dependa solo del color: donde haya series superpuestas, el
 * trazo distingue aunque el color no.
 */
export function modalityDash(modality: string): number[] {
  const family = MODALITY_FAMILY[modality];
  if (!family) return [];
  const slot = FAMILY_SLOT[family];
  return [[], [5, 3], [2, 2], [7, 2, 2, 2], [4, 2, 1, 2], [1, 2], [9, 3]][
    (slot - 1) % 7
  ] as number[];
}

/**
 * Escala divergente centrada en cero, para diferencias REF/ALT.
 *
 * El cero DEBE leerse neutro. Si el punto medio tirara hacia alguno de los dos
 * polos, el mapa sugeriria un efecto donde no lo hay, que es la forma mas facil
 * de mentir con un mapa de calor.
 *
 * @param domainMax Extremo positivo. El dominio es simetrico, [-max, +max], que
 *   es lo unico que garantiza que el cero caiga en el centro del color.
 */
export function divergingScale(domainMax: number): (value: number) => string {
  const stops = [
    token('--div-neg-3'),
    token('--div-neg-2'),
    token('--div-neg-1'),
    token('--div-zero'),
    token('--div-pos-1'),
    token('--div-pos-2'),
    token('--div-pos-3'),
  ];
  const ramp = piecewise(interpolateRgb, stops);
  const max = domainMax > 0 ? domainMax : 1;
  return (value: number) => {
    const t = (Math.max(-max, Math.min(max, value)) + max) / (2 * max);
    return ramp(t);
  };
}

/** Escala secuencial para magnitudes sin signo. Un solo tono, 13 pasos. */
export function sequentialScale(domainMax: number): (value: number) => string {
  const stops = Array.from({ length: 13 }, (_, i) => token(`--seq-${i}`));
  const ramp = piecewise(interpolateRgb, stops);
  const max = domainMax > 0 ? domainMax : 1;
  return (value: number) => ramp(Math.max(0, Math.min(1, Math.abs(value) / max)));
}

/** Color de nucleotido, convencion estandar y canal separado del categorico. */
export function nucleotideColor(base: string): string {
  switch (base.toUpperCase()) {
    case 'A':
      return token('--nt-a');
    case 'C':
      return token('--nt-c');
    case 'G':
      return token('--nt-g');
    case 'T':
      return token('--nt-t');
    default:
      return token('--ink-faint');
  }
}

/** Familias de features del AVI, en el orden en que se muestran. */
export const FAMILY_ORDER = [
  'regulatory',
  'protein',
  'conservation',
  'indel',
] as const;

/**
 * Etiqueta legible de una familia de features del AVI.
 *
 * A function, not a constant map: `t()` cannot run at module load (the
 * dictionary arrives after the modules evaluate).
 */
export function familyLabel(family: string): string {
  return has(`legend.aviFamily.${family}`) ? t(`legend.aviFamily.${family}`) : family;
}

/**
 * Color de una familia de features del AVI.
 *
 * Se reutilizan ranuras de la misma paleta en vez de inventar otra: cuatro
 * familias mas siete de modalidad serian once colores compitiendo. Los indels
 * van en tinta apagada porque en un SNV siempre valen cero, y un color fuerte
 * para algo que nunca aporta es ruido.
 *
 * Las ranuras son 5, 6 y 7 porque son el mejor trio MEDIDO, no las primeras de
 * la lista. Estas tres familias se comparan de un vistazo en la cascada, asi
 * que su trio tiene que aguantar las cuatro visiones en los dos temas, y se
 * puntua por el peor de los dos: el token es el mismo en claro y en oscuro.
 * Con ese criterio 5-6-7 da dE2000 13,0 y es el unico trio que pasa el umbral
 * de 12,0; el anterior 1-7-3 daba **1,7** —azul y violeta colapsan en
 * protanopia con el tema oscuro, que es indistinguible en la practica. La
 * ranura 8 queda fuera por reservada al estado critico, y excluirla no cuesta
 * nada: 5-6-7 tambien gana incluyendola. Lo comprueba
 * `pipeline/tools/validate_palette.py`, que LEE estas mismas ranuras de este
 * archivo y falla si se desfasan o si la separacion cae; `test_palette.py` lo
 * corre en cada pytest, asi que editar el `switch` de abajo sin medir rompe el
 * build. La evidencia esta en `docs/evidence/palette-validation.txt`.
 *
 * Dentro del trio todos los pares quedan por encima del umbral, asi que cual
 * de las tres familias recibe cual ranura es indiferente y no se discute.
 * Coincide con las modalidades de splicing, cromatina-3D y poliadenilacion,
 * que es la reutilizacion ya declarada arriba: viven en paneles distintos de
 * la ficha y nunca comparten leyenda.
 */
export function familyColor(family: string): string {
  switch (family) {
    case 'regulatory':
      return slotColor(5);
    case 'protein':
      return slotColor(6);
    case 'conservation':
      return slotColor(7);
    case 'indel':
      return token('--ink-faint');
    default:
      return token('--ink-faint');
  }
}

/** Color con signo para una contribucion SHAP, usando los polos divergentes. */
export function contributionColor(value: number): string {
  return value >= 0 ? token('--div-pos-2') : token('--div-neg-2');
}
