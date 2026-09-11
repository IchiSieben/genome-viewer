/**
 * Escalas de color, derivadas de los tokens CSS.
 *
 * Ninguna vista define un color propio: todas piden aqui, y aqui se lee el
 * token del DOM. Asi el cambio de tema alcanza tambien al canvas, que no
 * entiende `var(--x)`.
 */

import { interpolateRgb, piecewise } from './interpolate';
import { token } from './dom';

/** Las 11 modalidades reales de `dna_output.OutputType`. */
export const MODALITY_ORDER = [
  'RNA_SEQ',
  'ATAC',
  'DNASE',
  'CAGE',
  'PROCAP',
  'CHIP_TF',
  'CHIP_HISTONE',
  'SPLICE_SITES',
  'SPLICE_SITE_USAGE',
  'POLYADENYLATION',
  'CONTACT_MAPS',
] as const;

const MODALITY_TOKEN: Record<string, string> = {
  RNA_SEQ: '--cat-rna-seq',
  ATAC: '--cat-atac',
  DNASE: '--cat-dnase',
  CAGE: '--cat-cage',
  PROCAP: '--cat-procap',
  CHIP_TF: '--cat-chip-tf',
  CHIP_HISTONE: '--cat-chip-histone',
  SPLICE_SITES: '--cat-splice-sites',
  SPLICE_SITE_USAGE: '--cat-splice-site-usage',
  POLYADENYLATION: '--cat-polyadenylation',
  CONTACT_MAPS: '--cat-contact-maps',
};

/** Color categorico de una modalidad. Gris neutro si no se reconoce. */
export function modalityColor(modality: string): string {
  const name = MODALITY_TOKEN[modality];
  return name ? token(name) : token('--ink-faint');
}

/**
 * Escala divergente centrada en cero, para diferencias REF/ALT.
 *
 * El cero DEBE leerse neutro. Si el punto medio tirara hacia alguno de los dos
 * extremos, el mapa sugeriria un efecto donde no lo hay, que es la forma mas
 * facil de mentir con un mapa de calor.
 *
 * @param domainMax Extremo positivo. El dominio es simetrico: [-max, +max], que
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

/** Escala secuencial para magnitudes sin signo. */
export function sequentialScale(domainMax: number): (value: number) => string {
  const stops = [
    token('--seq-0'),
    token('--seq-1'),
    token('--seq-2'),
    token('--seq-3'),
    token('--seq-4'),
    token('--seq-5'),
  ];
  const ramp = piecewise(interpolateRgb, stops);
  const max = domainMax > 0 ? domainMax : 1;
  return (value: number) => ramp(Math.max(0, Math.min(1, Math.abs(value) / max)));
}

/** Color de nucleotido, convencion estandar de navegador genomico. */
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

export const FAMILY_LABEL: Record<string, string> = {
  regulatory: 'Regulatorio',
  protein: 'Proteina',
  conservation: 'Conservacion',
  indel: 'Indel',
};

/**
 * Color de una familia de features.
 *
 * Se reutiliza la paleta categorica en vez de inventar otra: cuatro familias
 * mas once modalidades serian quince colores que competir entre si.
 */
export function familyColor(family: string): string {
  switch (family) {
    case 'regulatory':
      return token('--cat-rna-seq');
    case 'protein':
      return token('--cat-chip-histone');
    case 'conservation':
      return token('--cat-atac');
    case 'indel':
      return token('--cat-polyadenylation');
    default:
      return token('--ink-faint');
  }
}

/** Color con signo para una contribucion SHAP, usando los extremos divergentes. */
export function contributionColor(value: number): string {
  return value >= 0 ? token('--div-pos-2') : token('--div-neg-2');
}
