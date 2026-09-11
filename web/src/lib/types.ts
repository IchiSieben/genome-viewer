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
