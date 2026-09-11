/**
 * Piezas de interfaz compartidas por todas las vistas.
 *
 * Viven aqui y no en cada vista porque el encargo pide un solo sistema visual:
 * un tooltip que se ve distinto en dos vistas es la misma clase de error que dos
 * paletas distintas.
 */

import { el, clear } from './dom';
import * as fmt from './format';
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
      el('p', { class: 'state__title', text: `Cargando ${what}` }),
      sizeBytes
        ? el('p', { class: 'state__detail', text: `${fmt.bytes(sizeBytes)} por descargar` })
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
    ? el('button', { class: 'button', type: 'button', text: 'Reintentar' })
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
export function provenanceStrip(provenance: Provenance): HTMLElement {
  const synthetic = provenance.source === 'synthetic';
  const label = synthetic
    ? 'Datos sinteticos de desarrollo'
    : provenance.source === 'atlas-api'
      ? 'Atlas API'
      : 'Model API';

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
          text: 'No son predicciones de AlphaGenome.',
        })
      : null,
    el('span', {
      class: 'provenance__item',
      text: `cliente ${provenance.clientVersion}`,
    }),
    el('span', {
      class: 'provenance__item',
      text: `consultado ${fmt.timestamp(provenance.queriedAt)}`,
    }),
    el('span', {
      class: 'provenance__item',
      title:
        'Los cuantiles del AVI se recalibraron el 18/06/2026 y la inferencia de ' +
        'indels el 14/07/2026. Solo se pueden comparar artefactos de la misma epoca.',
      text: `calibracion ${provenance.calibrationEpoch}`,
    }),
    el('span', {
      class: 'provenance__item provenance__item--hash',
      text: `config ${provenance.configHash}`,
    }),
  );
}

/** Aviso de que lo mostrado son predicciones de un modelo, no mediciones. */
export function predictionNotice(): HTMLElement {
  return el('p', {
    class: 'notice',
    text:
      'Todo lo que se muestra son predicciones de un modelo, no mediciones ' +
      'experimentales. Sin uso clinico ni valor de consejo medico.',
  });
}
