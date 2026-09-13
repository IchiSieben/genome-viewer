/**
 * Tipos del contrato de datos v1.
 *
 * Espejo de `contracts/v1/*.schema.json`, que es la fuente normativa. Si los dos
 * se separan, el que tiene razon es el esquema: el pipeline valida contra el.
 */

export const SUPPORTED_MAJOR = 1;

export type ArtifactSource = 'atlas-api' | 'model-api' | 'synthetic';

export interface Provenance {
  source: ArtifactSource;
  clientVersion: string;
  pipelineVersion?: string;
  queriedAt: string;
  configHash: string;
  /** Epoca de calibracion. Comparar artefactos de epocas distintas es invalido. */
  calibrationEpoch: string;
  scorers?: string[];
  hasQuantiles?: boolean;
  notes?: string;
}

export interface Variant {
  id: string;
  chromosome: string;
  /** 1-based, como `genome.Variant`. */
  position: number;
  ref: string;
  alt: string;
  rsid?: string | null;
  gene?: string | null;
}

export interface Interval {
  chromosome: string;
  /** 0-based inclusivo, como `genome.Interval`. */
  start: number;
  /** 0-based exclusivo. */
  end: number;
}

export interface SignalRef {
  path: string;
  bytes: number;
  tracks: number;
  sha256?: string;
}

export type StudyStatus =
  | 'planned'
  | 'running'
  | 'positive'
  | 'null'
  | 'inconclusive'
  | 'underpowered';

export interface IndexDoc {
  schemaVersion: string;
  generated: string;
  provenance?: Provenance;
  /**
   * Variante que la portada muestra ya cargada.
   *
   * La deriva el pipeline de los `locus.json` emitidos, no un config, asi que
   * no puede quedar apuntando a un artefacto borrado. Opcional porque un
   * `data/dist/` sin variantes con saturacion no tiene portada que sembrar.
   */
  featured?: {
    locus: string;
    variant: string;
    saturation?: boolean;
  };
  loci: Array<{
    id: string;
    label: string;
    chromosome: string;
    start: number;
    end: number;
    genes?: string[];
    variantCount?: number;
    path: string;
    bytes?: number;
  }>;
  studies: Array<{
    id: string;
    label: string;
    status: StudyStatus;
    path: string;
  }>;
}

export interface SignalLevel {
  binSize: number;
  length: number;
  interval: Interval;
  modalities: Record<string, SignalRef>;
}

export interface LocusDoc {
  schemaVersion: string;
  id: string;
  label: string;
  interval: Interval;
  provenance: Provenance;
  genes?: string[];
  annotations?: string | null;
  variants: Array<{
    variant: Variant;
    aviPhred?: number | null;
    note?: string | null;
    /** Bloques de senal de ESTA variante. El delta pertenece a la variante. */
    signals?: {
      overview?: SignalLevel;
      detail?: SignalLevel;
    };
    artifacts: {
      card?: string | null;
      tracks?: string | null;
      splice?: string | null;
      contact?: string | null;
      saturation?: string | null;
    };
  }>;
  signals?: {
    overview?: SignalLevel;
    detail?: SignalLevel;
  };
}

export type FeatureFamily = 'regulatory' | 'protein' | 'conservation' | 'indel';

export interface AviFeature {
  id: string;
  label: string;
  family: FeatureFamily;
  /** Contribucion SHAP con signo. */
  contribution: number;
  value?: number | null;
}

export interface CardDoc {
  schemaVersion: string;
  variant: Variant;
  provenance: Provenance;
  avi: {
    /** PHRED = -10*log10(1-cuantil). 10 = top 10 %, 20 = top 1 %, 30 = top 0,1 %. */
    phred: number;
    quantile?: number | null;
    /** Valor base de la cascada SHAP. Medido: -0,049016. */
    baseValue?: number | null;
    /** Score crudo CON SIGNO del scorer AVI_SCORE. Puede ser negativo. */
    rawScore?: number | null;
  };
  featureFamilies?: Array<{
    id: FeatureFamily;
    label: string;
    expectedCount?: number;
  }>;
  features: AviFeature[];
  topTracks?: Array<{
    name: string;
    modality: string;
    biosample?: string | null;
    ontologyCurie?: string | null;
    strand?: '+' | '-' | '.' | null;
    score: number;
    quantile?: number | null;
  }>;
}

/** Celda dispersa: [indice biosample, indice modalidad, valor, cuantil]. */
export type HeatCell = [number, number, number, (number | null)?];

export interface TracksDoc {
  schemaVersion: string;
  variant: Variant;
  provenance: Provenance;
  modalities: Array<{
    id: string;
    label: string;
    signed?: boolean;
    unit?: string | null;
  }>;
  organSystems?: Array<{ id: string; label: string }>;
  biosamples: Array<{
    id: string;
    label: string;
    ontologyCurie?: string | null;
    biosampleType?: string | null;
    organSystem?: string | null;
  }>;
  /** Cuantos habia antes de recortar. Mayor que biosamples.length = subconjunto. */
  biosampleTotal?: number;
  cells: HeatCell[];
}

export interface StudyDoc {
  schemaVersion: string;
  id: string;
  label: string;
  summary?: string;
  status: StudyStatus;
  provenance?: Provenance;
  honesty: {
    sampleSize: Record<string, number | string>;
    power?: {
      achieved?: number | null;
      target?: number | null;
      /** Haplotipos independientes, NO conteo de variantes. */
      effectiveUnits?: number | null;
      note?: string | null;
    } | null;
    limitations: string[];
    preregistered?: boolean | null;
    ethics?: string | null;
  };
  panels: Array<{
    id: string;
    type:
      | 'distribution'
      | 'calibration'
      | 'dosage'
      | 'forest'
      | 'scatter'
      | 'table'
      | 'note';
    title: string;
    caption?: string | null;
    data: string | Record<string, unknown>;
    options?: Record<string, unknown>;
  }>;
}

export interface AnnotationsDoc {
  schemaVersion: string;
  locus: string;
  interval: Interval;
  provenance: Provenance;
  genes: Array<{
    name: string;
    strand: '+' | '-' | '.';
    start: number;
    end: number;
    transcripts?: Array<{ id: string; exons: Array<[number, number]> }>;
  }>;
}

export interface SaturationDoc {
  schemaVersion: string;
  locus: string;
  interval: Interval;
  provenance: Provenance;
  /** Posicion 1-based de la variante que ancla la ventana. */
  focus?: number | null;
  /** Secuencia de referencia, una base por columna. */
  reference: string;
  /** Filas del mapa, en orden fijo. */
  alts: string[];
  /** Una fila por base alternativa; null donde el alelo es el de referencia. */
  phred: Array<Array<number | null>>;
  /** El mismo mapa con el score crudo y con signo. */
  raw?: Array<Array<number | null>>;
  maxPhred?: number | null;
  coverage?: number | null;
}

export interface SpliceJunction {
  /** 0-based, como genome.Interval. Donante o aceptor segun la hebra. */
  start: number;
  end: number;
  strand: '+' | '-';
  /** Valor predicho antes de la variante. Split-read count del modelo. */
  ref: number;
  /** Valor predicho despues de la variante, misma unidad que `ref`. */
  alt: number;
}

/**
 * V5 — Diff de mapa de contacto, ALT menos REF, sobre un biosample declarado.
 *
 * AVISO SOBRE LAS UNIDADES: los valores NO son probabilidades, pese a lo que
 * dice el docstring del SDK. El 79 % de los de REF son negativos: el mapa ya
 * viene en espacio logaritmico y con el decaimiento por distancia retirado.
 * Por eso `delta` es una RESTA y ya es un log-cociente: no hay division, no
 * hace falta pseudoconteo y no hay que normalizar por distancia.
 */
export interface ContactsDoc {
  schemaVersion: string;
  variant: Variant;
  provenance: Provenance;
  biosample: { name: string; ontologyCurie: string };
  /**
   * 'no_data' = no hubo mapa. NO es lo mismo que un diff cerca de cero, que
   * es 'ok' con `maxAbsDelta` pequeno: eso no es un dato que falta, es la
   * medicion de que la estructura no se movio.
   */
  status: 'ok' | 'no_data';
  finding?: string;
  /** Ventana recortada que se dibuja. */
  interval?: Interval;
  /** Ventana de 1 Mb sobre la que se predijo; es donde se midio el maximo. */
  predictedInterval?: Interval;
  resolution?: number;
  bins?: number;
  /** Bin de la variante dentro del recorte: su fila es la cruz del AVI. */
  variantBin?: number;
  /**
   * Dominio ABSOLUTO del color. La vista lo usa tal cual y jamas lo recalcula
   * desde los datos: si el dominio cambiara con los datos seria autoescalado,
   * que es exactamente la forma de pintar un patron dramatico a partir de
   * ruido sin que ningun test falle.
   */
  domain?: number;
  visibleThreshold?: number;
  maxAbsDelta?: number;
  maxAbsDeltaAt?: {
    /** OJO: en coordenadas de la matriz COMPLETA, no del recorte dibujado. */
    fullBin: number;
    /**
     * Si el maximo cae dentro de lo que la vista dibuja. Puede no caer: el
     * maximo se mide sobre el megabase entero. Sin esta bandera la vista
     * diria "ese maximo toca la cruz" y el lector recorreria la fila
     * resaltada sin encontrarlo nunca.
     */
    insideDrawnWindow: boolean;
    involvesVariantBin: boolean;
    separationBp: number;
    ref: number;
    alt: number;
  };
  /** Reconstruccion local de lo que mide ContactMapScorer del AVI. */
  variantRowMeanAbsDelta?: number;
  /** Relieve que la estructura YA tiene, contra el que se lee el diff. */
  referenceRange?: { min: number; max: number; p1: number; p99: number };
  scales?: { reference: number; delta: number };
  /** Triangulo superior por filas, diagonal incluida, en enteros. */
  reference?: number[];
  delta?: number[];
}

export interface SpliceDoc {
  schemaVersion: string;
  variant: Variant;
  provenance: Provenance;
  /** El biosample que se pidio explicitamente, no uno generico. */
  biosample: { name: string; ontologyCurie: string };
  /** Ventana mostrada; NO la de 1 Mb que se le da al modelo. */
  interval: Interval;
  /**
   * 'no_data' = modalidad silenciosa: el Atlas devolvio CERO uniones en TODO
   * el locus para este biosample (no solo en esta ventana). Distinto de una
   * ventana vacia tras el piso de magnitud, que es 'ok' con `junctions: []`.
   */
  status: 'ok' | 'no_data';
  /**
   * Hallazgo redactado a mano sobre este artefacto, sin cifras dentro.
   *
   * Las cifras las pinta la vista desde `junctions`: prosa congelada con
   * numeros dentro es prosa que miente en cuanto el artefacto se regenere.
   */
  finding?: string;
  /** Piso de magnitud aplicado: solo entran uniones con ref o alt >= esto. */
  minValueShown: number;
  /** Uniones en la ventana ANTES del piso. Si es 0 con status 'ok', la
   * ventana esta vacia de verdad, no es que falten datos. */
  totalJunctionsInWindow: number;
  junctions: SpliceJunction[];
}
