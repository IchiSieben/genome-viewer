/**
 * V1 — Ficha de variante.
 *
 * El AVI situado sobre su escala PHRED, la cascada de contribuciones SHAP de
 * los 18 features agrupados en sus cuatro familias, y los tracks mas afectados.
 *
 * Es la vista mas novedosa y la mas barata: las atribuciones del AVI son
 * publicas desde hace tres dias y nadie las ha visualizado todavia.
 *
 * Los 18 features se leen del documento como LISTA ORDENADA. Sus nombres reales
 * son server-side y no estan en el cliente 0.9.0, asi que esta vista no puede
 * depender de ninguno en particular: renderiza lo que venga, agrupado por la
 * familia que el propio artefacto declara.
 */

import { clear, el, onResize, onThemeChange, svg } from '../lib/dom';
import * as fmt from '../lib/format';
import { FAMILY_LABEL, FAMILY_ORDER, familyColor, modalityColor } from '../lib/color';
import { panel, predictionNotice, provenanceStrip, tooltip } from '../lib/ui';
import type { AviFeature, CardDoc } from '../lib/types';

const ROW_HEIGHT = 22;
const ROW_GAP = 3;
const FAMILY_GAP = 16;
const LABEL_WIDTH = 190;
const VALUE_WIDTH = 76;
const MIN_PLOT_WIDTH = 180;

/** PHRED maximo del eje. 40 = top 0,01 %, mas alla la escala deja de informar. */
const PHRED_AXIS_MAX = 40;

interface WaterfallRow {
  feature: AviFeature;
  /** Acumulado antes de aplicar esta contribucion. */
  from: number;
  /** Acumulado despues. */
  to: number;
  y: number;
}

/**
 * Medidor del AVI sobre su escala PHRED.
 *
 * El PHRED sin interpretacion es un numero que nadie sabe leer, asi que la
 * escala lleva marcas con su significado: 10 = top 10 %, 20 = top 1 %,
 * 30 = top 0,1 %.
 */
function aviGauge(card: CardDoc, width: number): HTMLElement {
  const height = 74;
  const padLeft = 4;
  const padRight = 4;
  const barY = 26;
  const barHeight = 10;
  const plotWidth = Math.max(120, width - padLeft - padRight);
  const x = (phred: number) =>
    padLeft + (Math.max(0, Math.min(PHRED_AXIS_MAX, phred)) / PHRED_AXIS_MAX) * plotWidth;

  const root = svg('svg', {
    class: 'gauge',
    width: String(width),
    height: String(height),
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `AVI PHRED ${fmt.fixed2(card.avi.phred)}, ${fmt.phredMeaning(
      card.avi.phred,
    )}`,
  });

  // Canal de fondo.
  root.append(
    svg('rect', {
      x: String(padLeft),
      y: String(barY),
      width: String(plotWidth),
      height: String(barHeight),
      rx: '2',
      class: 'gauge__track',
    }),
  );

  // Relleno hasta el valor.
  root.append(
    svg('rect', {
      x: String(padLeft),
      y: String(barY),
      width: String(Math.max(0, x(card.avi.phred) - padLeft)),
      height: String(barHeight),
      rx: '2',
      class: 'gauge__fill',
    }),
  );

  // Marcas interpretables.
  for (const tick of fmt.PHRED_TICKS) {
    if (tick.value > PHRED_AXIS_MAX) continue;
    const tx = x(tick.value);
    root.append(
      svg('line', {
        x1: String(tx),
        x2: String(tx),
        y1: String(barY + barHeight),
        y2: String(barY + barHeight + 4),
        class: 'gauge__tick',
      }),
      svg('text', {
        x: String(tx),
        y: String(barY + barHeight + 16),
        class: 'gauge__tick-label',
        // La ultima marca se ancla al final para que su etiqueta no se salga
        // por el borde derecho del SVG.
        'text-anchor':
          tick.value === 0
            ? 'start'
            : tick.value >= PHRED_AXIS_MAX
              ? 'end'
              : 'middle',
        text: tick.label,
      }),
    );
  }

  // Aguja del valor.
  const vx = x(card.avi.phred);
  root.append(
    svg('line', {
      x1: String(vx),
      x2: String(vx),
      y1: String(barY - 8),
      y2: String(barY + barHeight + 2),
      class: 'gauge__needle',
    }),
    svg('text', {
      x: String(vx),
      y: String(barY - 12),
      class: 'gauge__value',
      'text-anchor': vx > plotWidth * 0.8 ? 'end' : 'start',
      text: fmt.fixed2(card.avi.phred),
    }),
  );

  return el(
    'div',
    { class: 'gauge-block' },
    el(
      'div',
      { class: 'gauge-block__readout' },
      el('span', { class: 'gauge-block__number', text: fmt.fixed2(card.avi.phred) }),
      el('span', { class: 'gauge-block__unit', text: 'PHRED' }),
      el('span', {
        class: 'gauge-block__meaning',
        text: fmt.phredMeaning(card.avi.phred),
      }),
    ),
    root as unknown as HTMLElement,
    el('p', { class: 'gauge-block__legend', text: fmt.PHRED_LEGEND }),
    el(
      'p',
      { class: 'gauge-block__formula' },
      'PHRED = -10 · log₁₀(1 - cuantil)',
      card.avi.rawScore !== null && card.avi.rawScore !== undefined
        ? `   ·   score crudo ${fmt.signed2(card.avi.rawScore)}`
        : '',
    ),
  );
}

/** Ordena features por familia y, dentro de cada una, por magnitud. */
function layoutRows(card: CardDoc): { rows: WaterfallRow[]; height: number } {
  const byFamily = new Map<string, AviFeature[]>();
  for (const feature of card.features) {
    const list = byFamily.get(feature.family) ?? [];
    list.push(feature);
    byFamily.set(feature.family, list);
  }

  const rows: WaterfallRow[] = [];
  let cumulative = card.avi.baseValue ?? 0;
  let y = 0;

  for (const family of FAMILY_ORDER) {
    const features = byFamily.get(family);
    if (!features?.length) continue;
    y += FAMILY_GAP;
    // Dentro de la familia, de mayor a menor magnitud: lo que mas mueve el
    // score se lee primero.
    features.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    for (const feature of features) {
      const from = cumulative;
      cumulative += feature.contribution;
      rows.push({ feature, from, to: cumulative, y });
      y += ROW_HEIGHT + ROW_GAP;
    }
  }

  return { rows, height: y + FAMILY_GAP };
}

/**
 * Cascada de contribuciones SHAP.
 *
 * Muestra las dos cosas que pide el encargo: la contribucion neta con signo
 * (la barra va del acumulado anterior al nuevo, asi que su direccion y longitud
 * son el aporte con signo) y la magnitud relativa (el ancho de la barra contra
 * el ancho total del eje).
 */
function waterfall(card: CardDoc, width: number): HTMLElement {
  const { rows, height } = layoutRows(card);
  const plotWidth = Math.max(MIN_PLOT_WIDTH, width - LABEL_WIDTH - VALUE_WIDTH - 16);

  const base = card.avi.baseValue ?? 0;
  const values = rows.flatMap((r) => [r.from, r.to]).concat(base);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.08 || 1;
  const domainLo = lo - pad;
  const domainHi = hi + pad;
  const x = (value: number) =>
    LABEL_WIDTH + ((value - domainLo) / (domainHi - domainLo)) * plotWidth;

  const root = svg('svg', {
    class: 'waterfall',
    width: String(width),
    height: String(height),
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label':
      `Cascada de ${card.features.length} contribuciones SHAP al score AVI, ` +
      'agrupadas en cuatro familias.',
  });

  // Linea del valor base: de donde parte la explicacion.
  root.append(
    svg('line', {
      x1: String(x(base)),
      x2: String(x(base)),
      y1: '0',
      y2: String(height),
      class: 'waterfall__baseline',
    }),
  );

  const tip = tooltip();
  let currentFamily = '';

  for (const row of rows) {
    const { feature } = row;

    if (feature.family !== currentFamily) {
      currentFamily = feature.family;
      const expected = card.featureFamilies?.find((f) => f.id === feature.family);
      root.append(
        svg('text', {
          x: '0',
          y: String(row.y - 5),
          class: 'waterfall__family',
          text:
            (expected?.label ?? FAMILY_LABEL[feature.family] ?? feature.family) +
            (expected?.expectedCount ? ` · ${expected.expectedCount}` : ''),
        }),
        svg('line', {
          x1: '0',
          x2: String(width),
          y1: String(row.y - 1),
          y2: String(row.y - 1),
          class: 'waterfall__family-rule',
          style: `stroke:${familyColor(feature.family)}`,
        }),
      );
    }

    const x0 = Math.min(x(row.from), x(row.to));
    const x1 = Math.max(x(row.from), x(row.to));
    const positive = feature.contribution >= 0;

    const group = svg('g', { class: 'waterfall__row', tabindex: '0', role: 'listitem' });

    group.append(
      svg('text', {
        x: String(LABEL_WIDTH - 10),
        y: String(row.y + ROW_HEIGHT / 2 + 4),
        class: 'waterfall__label',
        'text-anchor': 'end',
        text: feature.label,
      }),
      svg('rect', {
        x: String(x0),
        y: String(row.y + 3),
        // Una contribucion de cero seria invisible; 1,5 px la deja presente
        // como "se midio y no aporto", que no es lo mismo que no estar.
        width: String(Math.max(1.5, x1 - x0)),
        height: String(ROW_HEIGHT - 6),
        rx: '1.5',
        class: positive
          ? 'waterfall__bar waterfall__bar--pos'
          : 'waterfall__bar waterfall__bar--neg',
      }),
      svg('text', {
        x: String(width - 4),
        y: String(row.y + ROW_HEIGHT / 2 + 4),
        class: 'waterfall__value',
        'text-anchor': 'end',
        text: fmt.signed2(feature.contribution),
      }),
    );

    const describe = (event: MouseEvent | FocusEvent) => {
      const target = event.target as Element;
      const rect = target.getBoundingClientRect();
      const mouse = event as MouseEvent;
      tip.show(
        feature.label,
        [
          {
            label: 'Contribucion',
            value: fmt.signed2(feature.contribution),
            swatch: familyColor(feature.family),
            emphasis: true,
          },
          {
            label: 'Familia',
            value: FAMILY_LABEL[feature.family] ?? feature.family,
          },
          ...(feature.value !== null && feature.value !== undefined
            ? [{ label: 'Valor del feature', value: fmt.fixed2(feature.value) }]
            : []),
          { label: 'Acumulado antes', value: fmt.fixed2(row.from) },
          { label: 'Acumulado despues', value: fmt.fixed2(row.to) },
        ],
        mouse.clientX || rect.right,
        mouse.clientY || rect.top,
      );
    };

    group.addEventListener('mouseenter', describe);
    group.addEventListener('mousemove', (event) =>
      tip.move(event.clientX, event.clientY),
    );
    group.addEventListener('mouseleave', () => tip.hide());
    group.addEventListener('focus', describe);
    group.addEventListener('blur', () => tip.hide());

    root.append(group);
  }

  return root as unknown as HTMLElement;
}

/** Resumen por familia: aporte neto y magnitud total. */
function familySummary(card: CardDoc): HTMLElement {
  const rows = FAMILY_ORDER.map((family) => {
    const features = card.features.filter((f) => f.family === family);
    if (!features.length) return null;
    const net = features.reduce((sum, f) => sum + f.contribution, 0);
    const magnitude = features.reduce((sum, f) => sum + Math.abs(f.contribution), 0);
    return { family, net, magnitude, count: features.length };
  }).filter((row): row is NonNullable<typeof row> => row !== null);

  const maxMagnitude = Math.max(...rows.map((r) => r.magnitude), 1);

  return el(
    'ul',
    { class: 'family-summary' },
    ...rows.map((row) =>
      el(
        'li',
        { class: 'family-summary__row' },
        el('span', {
          class: 'family-summary__swatch',
          style: `background:${familyColor(row.family)}`,
          'aria-hidden': 'true',
        }),
        el('span', {
          class: 'family-summary__name',
          text: `${FAMILY_LABEL[row.family] ?? row.family} · ${row.count}`,
        }),
        el(
          'span',
          { class: 'family-summary__bar-track' },
          el('span', {
            class: 'family-summary__bar',
            style:
              `width:${(row.magnitude / maxMagnitude) * 100}%;` +
              `background:${familyColor(row.family)}`,
          }),
        ),
        el('span', {
          class: 'family-summary__net',
          text: fmt.signed2(row.net),
          title: `Magnitud total ${fmt.fixed2(row.magnitude)}`,
        }),
      ),
    ),
  );
}

/** Tracks mas afectados, ordenados por magnitud del efecto. */
function topTracks(card: CardDoc): HTMLElement {
  const all = card.topTracks ?? [];
  if (!all.length) {
    return el('p', { class: 'state__detail', text: 'Sin tracks destacados.' });
  }
  // Tope por modalidad. Sin el, una modalidad con cientos de tracks copa la
  // lista entera y el panel deja de informar sobre las demas: doce filas de
  // SPLICE_JUNCTIONS dicen mucho menos que cuatro modalidades distintas.
  const PER_MODALITY = 3;
  const seen = new Map<string, number>();
  const tracks = all.filter((t) => {
    const n = seen.get(t.modality) ?? 0;
    if (n >= PER_MODALITY) return false;
    seen.set(t.modality, n + 1);
    return true;
  });
  const max = Math.max(...tracks.map((t) => Math.abs(t.score)), 1);

  return el(
    'ul',
    { class: 'track-list' },
    ...tracks.slice(0, 12).map((track) => {
      const fraction = Math.abs(track.score) / max;
      return el(
        'li',
        { class: 'track-list__row' },
        el('span', {
          class: 'track-list__swatch',
          style: `background:${modalityColor(track.modality)}`,
          'aria-hidden': 'true',
        }),
        el(
          'span',
          { class: 'track-list__names' },
          el('span', { class: 'track-list__biosample', text: track.biosample ?? '—' }),
          el('span', { class: 'track-list__modality', text: track.modality }),
        ),
        el(
          'span',
          { class: 'track-list__bar-track' },
          el('span', {
            class:
              track.score >= 0
                ? 'track-list__bar track-list__bar--pos'
                : 'track-list__bar track-list__bar--neg',
            style: `width:${fraction * 100}%`,
          }),
        ),
        el('span', { class: 'track-list__score', text: fmt.signed2(track.score) }),
      );
    }),
  );
}

/** Monta la vista completa en `container` y devuelve la funcion de limpieza. */
export function renderVariantCard(container: HTMLElement, card: CardDoc): () => void {
  const gaugeSlot = el('div', { class: 'card__gauge-slot' });
  const waterfallSlot = el('div', { class: 'card__waterfall-slot' });

  const draw = (width: number) => {
    clear(gaugeSlot);
    clear(waterfallSlot);
    gaugeSlot.append(aviGauge(card, Math.min(width, 520)));
    waterfallSlot.append(waterfall(card, Math.max(320, width)));
  };

  const header = el(
    'div',
    { class: 'card__identity' },
    el('h1', { class: 'card__title', text: fmt.variantLabel(card.variant) }),
    el(
      'p',
      { class: 'card__meta' },
      card.variant.rsid
        ? el('span', { class: 'card__chip', text: card.variant.rsid })
        : null,
      card.variant.gene
        ? el('span', { class: 'card__chip', text: card.variant.gene })
        : null,
      el('span', { class: 'card__chip card__chip--quiet', text: 'GRCh38' }),
    ),
  );

  container.append(
    header,
    provenanceStrip(card.provenance),
    el(
      'div',
      { class: 'card__grid' },
      panel(
        {
          title: 'Score AVI',
          subtitle: 'Posicion de la variante en la escala PHRED del Atlas',
          hint:
            'Un PHRED de 20 significa que la variante esta en el 1 % mas alto ' +
            'de todas las del genoma. La escala es logaritmica.',
        },
        gaugeSlot,
      ),
      panel(
        {
          title: 'Aporte por familia',
          subtitle: 'Neto con signo y magnitud total de cada grupo de features',
          hint:
            'La barra mide la magnitud total del grupo; el numero de la derecha ' +
            'es el aporte neto, que puede ser chico si hay features que se cancelan.',
        },
        familySummary(card),
      ),
    ),
    panel(
      {
        title: 'Cascada de atribuciones SHAP',
        subtitle: `${card.features.length} features, agrupados en cuatro familias`,
        hint:
          'Cada barra va del score acumulado antes del feature al de despues. ' +
          'Hacia la derecha sube el score, hacia la izquierda lo baja. La linea ' +
          'vertical es el valor base del que parte la explicacion.',
      },
      waterfallSlot,
    ),
    panel(
      {
        title: 'Tracks mas afectados',
        subtitle: `Mayor magnitud de efecto, hasta ${3} por modalidad`,
        hint:
          'El cuadrito de la izquierda es la modalidad. El color de la barra es ' +
          'la direccion del efecto: naranja lo sube, azul lo baja. La barra mide ' +
          'magnitud, no signo.',
      },
      topTracks(card),
    ),
    predictionNotice(),
  );

  const stopResize = onResize(waterfallSlot, draw);
  // El canvas y los colores leidos por token tienen que rehacerse al cambiar de
  // tema: los tokens se resuelven en el momento del dibujo, no despues.
  const stopTheme = onThemeChange(() => draw(waterfallSlot.clientWidth || 640));
  draw(waterfallSlot.clientWidth || 640);

  return () => {
    stopResize();
    stopTheme();
    tooltip().hide();
  };
}
