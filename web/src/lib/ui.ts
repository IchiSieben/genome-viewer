/**
 * Piezas de interfaz compartidas por todas las vistas.
 *
 * Viven aqui y no en cada vista porque el encargo pide un solo sistema visual:
 * un tooltip que se ve distinto en dos vistas es la misma clase de error que dos
 * paletas distintas.
 */

import { el, clear } from './dom';
import * as fmt from './format';
import { t } from '../i18n';
import type { Provenance } from './types';

// --------------------------------------------------------------------------
// Tooltip
// --------------------------------------------------------------------------

export interface TooltipRow {
  label: string;
  value: string;
  /** Cuadro de color a la izquierda de la fila. */
  swatch?: string;
  /** Resalta la fila como el dato principal. */
  emphasis?: boolean;
}

/**
 * Tooltip unico, compartido por todas las vistas.
 *
 * Uno solo y reposicionado, en vez de uno por grafico: con cientos de celdas en
 * el mapa de calor, un nodo por celda seria un desperdicio de DOM que ademas se
 * nota al desplazarse.
 */
export class Tooltip {
  private readonly node: HTMLElement;
  private visible = false;

  constructor() {
    this.node = el('div', { class: 'tooltip', role: 'tooltip', 'aria-hidden': 'true' });
    document.body.append(this.node);
  }

  show(title: string, rows: TooltipRow[], x: number, y: number): void {
    clear(this.node);
    this.node.append(el('div', { class: 'tooltip__title', text: title }));
    const table = el('div', { class: 'tooltip__rows' });
    for (const row of rows) {
      table.append(
        el(
          'div',
          { class: row.emphasis ? 'tooltip__row tooltip__row--strong' : 'tooltip__row' },
          row.swatch
            ? el('span', {
                class: 'tooltip__swatch',
                style: `background:${row.swatch}`,
              })
            : null,
          el('span', { class: 'tooltip__label', text: row.label }),
          el('span', { class: 'tooltip__value', text: row.value }),
        ),
      );
    }
    this.node.append(table);
    this.node.setAttribute('aria-hidden', 'false');
    this.node.classList.add('is-visible');
    this.visible = true;
    this.move(x, y);
  }

  /** Reposiciona manteniendo el tooltip dentro de la ventana. */
  move(x: number, y: number): void {
    if (!this.visible) return;
    const rect = this.node.getBoundingClientRect();
    const margin = 12;
    let left = x + margin;
    let top = y + margin;
    if (left + rect.width > window.innerWidth - margin) {
      left = x - rect.width - margin;
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = y - rect.height - margin;
    }
    this.node.style.transform = `translate(${Math.max(margin, left)}px, ${Math.max(
      margin,
      top,
    )}px)`;
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.node.classList.remove('is-visible');
    this.node.setAttribute('aria-hidden', 'true');
  }
}

let shared: Tooltip | null = null;

export function tooltip(): Tooltip {
  shared ??= new Tooltip();
  return shared;
}

// --------------------------------------------------------------------------
// Panel
// --------------------------------------------------------------------------

export interface PanelOptions {
  title: string;
  subtitle?: string;
  /** Texto corto que explica como leer el grafico. */
  hint?: string;
  actions?: HTMLElement[];
}

/** Marco estandar de un panel: titulo, subtitulo, ayuda de lectura y cuerpo. */
export function panel(options: PanelOptions, body: HTMLElement): HTMLElement {
  const header = el(
    'header',
    { class: 'panel__header' },
    el(
      'div',
      { class: 'panel__titles' },
      el('h2', { class: 'panel__title', text: options.title }),
      options.subtitle
        ? el('p', { class: 'panel__subtitle', text: options.subtitle })
        : null,
    ),
    options.actions?.length
      ? el('div', { class: 'panel__actions' }, ...options.actions)
      : null,
  );

  return el(
    'section',
    { class: 'panel' },
    header,
    options.hint ? el('p', { class: 'panel__hint', text: options.hint }) : null,
    body,
  );
}

// --------------------------------------------------------------------------
// Estados
// --------------------------------------------------------------------------

/**
 * Estado de carga que dice que se esta cargando y de que tamano.
 *
 * Un locus que aun no se descargo tiene que decirlo, no quedarse en blanco.
 */
export function loadingState(what: string, sizeBytes?: number): HTMLElement {
  return el(
    'div',
    { class: 'state state--loading', role: 'status' },
    el('span', { class: 'state__spinner', 'aria-hidden': 'true' }),
    el(
      'div',
      {},
      el('p', { class: 'state__title', text: t('ui.loading.title', { what }) }),
      sizeBytes
        ? el('p', {
            class: 'state__detail',
            text: t('ui.loading.size', { size: fmt.bytes(sizeBytes) }),
          })
        : null,
    ),
  );
}

export function emptyState(title: string, detail?: string): HTMLElement {
  return el(
    'div',
    { class: 'state state--empty' },
    el('p', { class: 'state__title', text: title }),
    detail ? el('p', { class: 'state__detail', text: detail }) : null,
  );
}

export function errorState(title: string, detail?: string, retry?: () => void): HTMLElement {
  const button = retry
    ? el('button', { class: 'button', type: 'button', text: t('ui.retry') })
    : null;
  button?.addEventListener('click', retry!);
  return el(
    'div',
    { class: 'state state--error', role: 'alert' },
    el('p', { class: 'state__title', text: title }),
    detail ? el('p', { class: 'state__detail', text: detail }) : null,
    button,
  );
}

// --------------------------------------------------------------------------
// Proveniencia y avisos
// --------------------------------------------------------------------------

/**
 * Sello de proveniencia visible.
 *
 * Que un grafico venga de fixtures sinteticas y no de predicciones reales tiene
 * que leerse en pantalla, no solo en el JSON. Es la diferencia entre una demo
 * honesta y una figura que engana.
 */
/** Los unicos origenes que cuentan como "de la API". Espejo de `contract.API_SOURCES`. */
const API_SOURCES = new Set(['atlas-api', 'model-api']);

/** Etiqueta corta del origen, la que se lee sin detenerse a leer. */
export function sourceLabel(source: string): string {
  switch (source) {
    case 'atlas-api':
      return t('ui.source.atlasApi');
    case 'model-api':
      return t('ui.source.modelApi');
    case 'synthetic':
      return t('ui.source.synthetic');
    default:
      // Un origen que no conocemos no se traduce a algo tranquilizador.
      return t('ui.source.undeclared', { source });
  }
}

/**
 * Marca de origen, arriba y en cada vista.
 *
 * `provenanceStrip` ya existia, pero vive al PIE de la vista: hay que
 * desplazarse hasta el final para saber de donde salieron los numeros que se
 * estan mirando. Esta marca va junto al titulo, donde no se puede no verla.
 *
 * Lo que esta marca NO puede hacer, y conviene decirlo para no confiarse: no
 * habria cazado el fallo de la sesion 2. Los bloques `.bin` de senal no llevan
 * sello propio, asi que un bloque viejo en el sitio equivocado se dibuja bajo el
 * sello del locus correcto. Contra eso sirven el test de `.bin` huerfanos y la
 * compuerta de proveniencia del build, no la interfaz. La interfaz sirve para el
 * caso mas comun: que alguien mire una figura y sepa, sin preguntar, si es una
 * prediccion o una fixture.
 */
export function sourceChip(provenance: Provenance | undefined | null): HTMLElement {
  const source = provenance?.source ?? '';
  const trusted = API_SOURCES.has(source);
  return el(
    'span',
    {
      class: trusted ? 'source-chip' : 'source-chip source-chip--warn',
      title: trusted
        ? t('ui.sourceChip.tooltipTrusted', {
            source: sourceLabel(source),
            epoch: provenance?.calibrationEpoch ?? t('ui.sourceChip.epochUndeclared'),
          })
        : t('ui.sourceChip.tooltipWarn'),
    },
    el('span', { class: 'source-chip__dot', 'aria-hidden': 'true' }),
    el('span', {
      class: 'source-chip__text',
      text: provenance ? sourceLabel(source) : t('ui.sourceChip.none'),
    }),
  );
}

/**
 * Chip de rsid, o su ausencia declarada.
 *
 * dbSNP no tiene entrada para la gran mayoria de los SNVs que el Atlas puede
 * puntuar -es justo el punto del Atlas-, asi que "sin rsid" no es un hueco en
 * los datos, es informacion: nadie la ha catalogado todavia. Ocultarlo cuando
 * falta perderia el argumento; por eso se muestra siempre, con o sin valor.
 */
export function rsidChip(rsid: string | null | undefined): HTMLElement {
  return rsid
    ? el('span', { class: 'card__chip', text: rsid })
    : el('span', {
        class: 'card__chip card__chip--quiet',
        text: t('ui.rsid.none'),
        title: t('ui.rsid.noneTooltip'),
      });
}

export function provenanceStrip(provenance: Provenance): HTMLElement {
  // `synthetic` no es el unico origen que no vale: cualquiera que no este en
  // API_SOURCES tiene que verse como aviso, incluido uno que no conozcamos.
  const synthetic = !API_SOURCES.has(provenance.source);
  const label = sourceLabel(provenance.source);

  return el(
    'div',
    {
      class: synthetic
        ? 'provenance provenance--synthetic'
        : 'provenance',
    },
    el('span', { class: 'provenance__badge', text: label }),
    synthetic
      ? el('span', {
          class: 'provenance__warning',
          text: t('ui.provenance.warning'),
        })
      : null,
    el('span', {
      class: 'provenance__item',
      text: t('ui.provenance.client', { version: provenance.clientVersion }),
    }),
    el('span', {
      class: 'provenance__item',
      text: t('ui.provenance.queried', { timestamp: fmt.timestamp(provenance.queriedAt) }),
    }),
    el('span', {
      class: 'provenance__item',
      title: t('ui.provenance.calibrationTooltip'),
      text: t('ui.provenance.calibration', { epoch: provenance.calibrationEpoch }),
    }),
    el('span', {
      class: 'provenance__item provenance__item--hash',
      text: t('ui.provenance.config', { hash: provenance.configHash }),
    }),
  );
}

/** Aviso de que lo mostrado son predicciones de un modelo, no mediciones. */
export function predictionNotice(): HTMLElement {
  return el('p', {
    class: 'notice',
    text: t('ui.notice.prediction'),
  });
}

// --------------------------------------------------------------------------
// Resumen de variante para listados: medidor PHRED en miniatura + vistas
// --------------------------------------------------------------------------

/** Mismo eje que el medidor grande (PHRED_AXIS_MAX en variantCard.ts). */
const MINI_PHRED_MAX = 40;

/**
 * Una barra de 64 px con el AVI PHRED y su cifra: el medidor de la ficha,
 * reducido a lo que cabe en una fila de catalogo. Sin score (indel sin
 * cuantil, por ejemplo) no se dibuja barra: una barra vacia se leeria como
 * "cero", y no es cero, es "no hay dato".
 */
export function miniPhred(phred: number | null | undefined): HTMLElement {
  if (phred === null || phred === undefined) {
    return el('span', { class: 'mini-phred mini-phred--missing', text: t('locus.aviMissing') });
  }
  const pct = Math.max(0, Math.min(1, phred / MINI_PHRED_MAX)) * 100;
  return el(
    'span',
    {
      class: 'mini-phred',
      title: fmt.phredMeaning(phred),
    },
    el(
      'span',
      { class: 'mini-phred__track', 'aria-hidden': 'true' },
      el('span', { class: 'mini-phred__fill', style: `width:${pct.toFixed(1)}%` }),
    ),
    el('span', { class: 'mini-phred__value', text: `${fmt.fixed1(phred)} PHRED` }),
  );
}

/** Vistas que NO todas las variantes tienen: las que distinguen a esta. */
const DISTINCT_VIEWS = ['saturation', 'splice', 'contact'] as const;

export function viewBadges(artifacts: Partial<Record<string, string | null>>): HTMLElement | null {
  const present = DISTINCT_VIEWS.filter((v) => artifacts[v]);
  if (!present.length) return null;
  return el(
    'span',
    { class: 'view-badges' },
    ...present.map((v) => el('span', { class: `view-badge view-badge--${v}`, text: t(`variant.tab.${v}`) })),
  );
}
