/**
 * V2 — Mapa de calor biosample x modalidad.
 *
 * El efecto de una variante a lo largo de cientos de biosamples, agrupados por
 * modalidad y por sistema de organos. Son escalares, asi que pesa poco, y deja
 * ver de un vistazo si un efecto es ubicuo o especifico de tejido: justamente
 * lo que AlphaGenome aporta y ninguna herramienta muestra.
 *
 * El orden de las filas es por ontologia, NO alfabetico. Ordenar alfabeticamente
 * esparce los tejidos de un mismo sistema por todo el mapa y destruye el patron
 * que la vista existe para mostrar.
 */

import { clear, el, onResize, onThemeChange, svg } from '../lib/dom';
import * as fmt from '../lib/format';
import { dataText, t } from '../i18n';
import { divergingScale, modalityColor } from '../lib/color';
import { panel, predictionNotice, provenanceStrip, rsidChip, sourceChip, tooltip } from '../lib/ui';
import type { TracksDoc } from '../lib/types';

const ROW_HEIGHT = 17;
const ROW_GAP = 1;
const GROUP_GAP = 13;
const LABEL_WIDTH = 168;
const HEADER_HEIGHT = 96;
/** Corte de la etiqueta de columna: mas largo se sale por arriba del SVG. */
const MAX_COL_LABEL = 15;
const MIN_CELL = 26;
const MAX_CELL = 62;

interface RowLayout {
  biosampleIndex: number;
  y: number;
}

interface GroupLayout {
  id: string;
  label: string;
  y: number;
  height: number;
  rows: RowLayout[];
}

/** Agrupa los biosamples por sistema de organos conservando el orden declarado. */
function layoutGroups(doc: TracksDoc): { groups: GroupLayout[]; height: number } {
  const systems = doc.organSystems ?? [];
  const order = systems.length
    ? systems.map((s) => s.id)
    : [...new Set(doc.biosamples.map((b) => b.organSystem ?? 'otros'))];
  const labelOf = new Map(systems.map((s) => [s.id, dataText(`data.organ.${s.id}`, s.label)]));

  const groups: GroupLayout[] = [];
  let y = HEADER_HEIGHT;

  for (const id of order) {
    const indices = doc.biosamples
      .map((biosample, index) => ({ biosample, index }))
      .filter(({ biosample }) => (biosample.organSystem ?? 'otros') === id)
      .map(({ index }) => index);
    if (!indices.length) continue;

    const top = y;
    const rows: RowLayout[] = indices.map((biosampleIndex, i) => ({
      biosampleIndex,
      y: top + i * (ROW_HEIGHT + ROW_GAP),
    }));
    const height = indices.length * (ROW_HEIGHT + ROW_GAP);
    groups.push({ id, label: labelOf.get(id) ?? dataText(`data.organ.${id}`, id), y: top, height, rows });
    y = top + height + GROUP_GAP;
  }

  return { groups, height: y };
}

/**
 * Extremo de la escala de color, por percentil y no por maximo.
 *
 * Usar el maximo deja que una sola celda extrema comprima todo el resto contra
 * el neutro: el mapa se ve casi vacio y el patron real desaparece. Se toma el
 * percentil 98 de la magnitud y se recorta lo que pase de ahi, que es la
 * practica habitual en mapas de calor. La leyenda avisa del recorte con un
 * signo de mayor o igual, para que nadie lea el extremo como el valor real.
 */
function robustDomain(values: number[]): { max: number; clamped: boolean } {
  if (!values.length) return { max: 1, clamped: false };
  const magnitudes = values.map(Math.abs).sort((a, b) => a - b);
  const index = Math.min(
    magnitudes.length - 1,
    Math.floor(magnitudes.length * 0.98),
  );
  const cut = magnitudes[index] ?? 1;
  const peak = magnitudes[magnitudes.length - 1] ?? 1;
  const max = cut > 0 ? cut : peak || 1;
  return { max, clamped: peak > max * 1.001 };
}

/** Leyenda de la escala divergente, con el cero marcado como neutro. */
function legend(domainMax: number, width: number, clamped: boolean): SVGSVGElement {
  const height = 52;
  const barHeight = 9;
  const barTop = 22;
  const barLeft = 0;
  const barWidth = Math.min(260, Math.max(140, width * 0.4));
  const scale = divergingScale(domainMax);
  const root = svg('svg', {
    class: 'legend',
    width: String(barWidth + 60),
    height: String(height),
    viewBox: `0 0 ${barWidth + 60} ${height}`,
    role: 'img',
    'aria-label': t('heatmap.legend.ariaLabel', {
      lo: fmt.signed2(-domainMax),
      hi: fmt.signed2(domainMax),
    }),
  });

  const steps = 48;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    root.append(
      svg('rect', {
        x: String(barLeft + t * barWidth - barWidth / steps / 2),
        y: String(barTop),
        width: String(barWidth / steps + 1),
        height: String(barHeight),
        fill: scale(-domainMax + t * 2 * domainMax),
      }),
    );
  }

  // La barra empieza en x=0: la marca izquierda se ancla al inicio y la derecha
  // al final, si no se salen del lienzo.
  for (const [value, anchor] of [
    [-domainMax, 'start'],
    [0, 'middle'],
    [domainMax, 'end'],
  ] as const) {
    const x = barLeft + ((value + domainMax) / (2 * domainMax)) * barWidth;
    root.append(
      svg('line', {
        x1: String(x),
        x2: String(x),
        y1: String(barTop + barHeight),
        y2: String(barTop + barHeight + 3),
        class: 'legend__tick',
      }),
      svg('text', {
        x: String(x),
        y: String(barTop + barHeight + 14),
        class: 'legend__label',
        'text-anchor': anchor,
        text:
          value === 0
            ? '0'
            : clamped
              ? `${value < 0 ? '≤' : '≥'} ${fmt.signed2(value)}`
              : fmt.signed2(value),
      }),
    );
  }

  root.append(
    svg('text', {
      x: '0',
      y: '11',
      class: 'legend__title',
      text: t('heatmap.legend.title'),
    }),
  );

  return root;
}

function drawHeatmap(
  doc: TracksDoc,
  width: number,
  onOpenSignal?: (modality: string, biosample: string) => void,
): HTMLElement {
  const { groups, height } = layoutGroups(doc);
  const nModalities = doc.modalities.length;

  const available = Math.max(240, width - LABEL_WIDTH - 8);
  const cellWidth = Math.max(
    MIN_CELL,
    Math.min(MAX_CELL, Math.floor(available / nModalities)),
  );
  const gridWidth = cellWidth * nModalities;
  // Las etiquetas de columna van rotadas hacia arriba y a la DERECHA, asi que
  // la ultima se sale del lienzo si el ancho termina en la ultima celda.
  const LABEL_OVERHANG = 78;
  const totalWidth = LABEL_WIDTH + gridWidth + LABEL_OVERHANG;

  // Dominio simetrico: es lo unico que garantiza que el cero caiga en el centro
  // del color y se lea neutro.
  const { max: domainMax } = robustDomain(doc.cells.map(([, , value]) => value));
  const scale = divergingScale(domainMax);

  const byCell = new Map<string, (typeof doc.cells)[number]>();
  for (const cell of doc.cells) byCell.set(`${cell[0]}:${cell[1]}`, cell);

  const root = svg('svg', {
    class: 'heatmap',
    width: String(totalWidth),
    height: String(height),
    viewBox: `0 0 ${totalWidth} ${height}`,
    role: 'img',
    'aria-label': t('heatmap.ariaLabel', {
      n: doc.biosamples.length,
      m: nModalities,
      variant: fmt.variantLabel(doc.variant),
    }),
  });

  // Cabeceras de modalidad, rotadas para que quepan sin ensanchar la columna.
  doc.modalities.forEach((modality, i) => {
    const x = LABEL_WIDTH + i * cellWidth + cellWidth / 2;
    const full = dataText(`data.modality.${modality.id}`, modality.label);
    const label =
      full.length > MAX_COL_LABEL ? `${full.slice(0, MAX_COL_LABEL - 1)}…` : full;
    root.append(
      svg(
        'text',
        {
          x: String(x),
          y: String(HEADER_HEIGHT - 8),
          class: 'heatmap__col-label',
          transform: `rotate(-52 ${x} ${HEADER_HEIGHT - 8})`,
          'text-anchor': 'start',
        },
        // El titulo nativo da el nombre completo cuando se recorta.
        svg('title', { text: full }),
        label,
      ),
      svg('rect', {
        x: String(LABEL_WIDTH + i * cellWidth),
        y: String(HEADER_HEIGHT - 4),
        width: String(cellWidth - 1),
        height: '2',
        fill: modalityColor(modality.id),
        opacity: '0.85',
      }),
    );
  });

  const tip = tooltip();

  for (const group of groups) {
    root.append(
      svg('text', {
        x: '0',
        y: String(group.y - 3),
        class: 'heatmap__group-label',
        text: group.label,
      }),
    );

    for (const row of group.rows) {
      const biosample = doc.biosamples[row.biosampleIndex]!;
      root.append(
        svg('text', {
          x: String(LABEL_WIDTH - 8),
          y: String(row.y + ROW_HEIGHT - 5),
          class: 'heatmap__row-label',
          'text-anchor': 'end',
          text: biosample.label,
        }),
      );

      doc.modalities.forEach((modality, mi) => {
        const cell = byCell.get(`${row.biosampleIndex}:${mi}`);
        const value = cell ? cell[2] : null;
        const rect = svg('rect', {
          x: String(LABEL_WIDTH + mi * cellWidth),
          y: String(row.y),
          width: String(cellWidth - 1),
          height: String(ROW_HEIGHT - ROW_GAP),
          class: value === null ? 'heatmap__cell heatmap__cell--empty' : 'heatmap__cell',
          fill: value === null ? 'transparent' : scale(value),
          tabindex: '0',
          role: 'img',
          'aria-label': t('heatmap.cellAriaLabel', {
            biosample: biosample.label,
            modality: dataText(`data.modality.${modality.id}`, modality.label),
            value: value === null ? t('heatmap.cell.noData') : fmt.signed2(value),
          }),
        });

        const describe = (event: MouseEvent | FocusEvent) => {
          const mouse = event as MouseEvent;
          const box = (event.target as Element).getBoundingClientRect();
          tip.show(
            biosample.label,
            [
              {
                label: dataText(`data.modality.${modality.id}`, modality.label),
                value: value === null ? t('heatmap.cell.noData') : fmt.signed2(value),
                swatch: value === null ? undefined : scale(value),
                emphasis: true,
              },
              ...(cell?.[3] !== null && cell?.[3] !== undefined
                ? [{ label: t('heatmap.tooltip.quantile'), value: fmt.fixed2(cell[3]) }]
                : []),
              { label: t('heatmap.tooltip.system'), value: group.label },
              ...(biosample.biosampleType
                ? [{ label: t('heatmap.tooltip.type'), value: biosample.biosampleType }]
                : []),
              ...(biosample.ontologyCurie
                ? [{ label: t('heatmap.tooltip.ontology'), value: biosample.ontologyCurie }]
                : []),
              ...(onOpenSignal
                ? [{ label: '', value: t('heatmap.tooltip.linkHint') }]
                : []),
            ],
            mouse.clientX || box.right,
            mouse.clientY || box.top,
          );
        };

        if (onOpenSignal) {
          rect.style.cursor = 'pointer';
          rect.addEventListener('click', () =>
            onOpenSignal(modality.id, biosample.label),
          );
        }
        rect.addEventListener('mouseenter', describe);
        rect.addEventListener('mousemove', (event) =>
          tip.move(event.clientX, event.clientY),
        );
        rect.addEventListener('mouseleave', () => tip.hide());
        rect.addEventListener('focus', describe);
        rect.addEventListener('blur', () => tip.hide());

        root.append(rect);
      });
    }
  }

  // El contenedor con desplazamiento propio es lo que impide que la pagina
  // entera se desplace de lado en movil.
  return el(
    'div',
    {
      class: 'heatmap-scroll',
      tabindex: '0',
      role: 'region',
      'aria-label': t('heatmap.scrollRegion.ariaLabel'),
    },
    root as unknown as HTMLElement,
  );
}

/** Monta la vista y devuelve la funcion de limpieza. */
export function renderTissueHeatmap(
  container: HTMLElement,
  doc: TracksDoc,
  onOpenSignal?: (modality: string, biosample: string) => void,
): () => void {
  const slot = el('div', { class: 'heatmap-slot' });
  const legendSlot = el('div', { class: 'heatmap-legend' });

  const { max: domainMax, clamped } = robustDomain(
    doc.cells.map(([, , value]) => value),
  );

  const draw = (width: number) => {
    clear(slot);
    clear(legendSlot);
    legendSlot.append(legend(domainMax, width, clamped) as unknown as HTMLElement);
    slot.append(drawHeatmap(doc, width, onOpenSignal));
  };

  const covered = new Set(doc.cells.map((c) => `${c[0]}:${c[1]}`)).size;
  const total = doc.biosamples.length * doc.modalities.length;
  // Si el pipeline recorto filas, se dice. Mostrar 240 de 412 sin avisar seria
  // dejar creer que ese es todo el atlas de tejidos.
  const trimmed =
    doc.biosampleTotal !== undefined && doc.biosampleTotal > doc.biosamples.length
      ? t('heatmap.panel.trimmedNote', {
          shown: doc.biosamples.length,
          total: doc.biosampleTotal,
        })
      : '';

  container.append(
    el(
      'div',
      { class: 'card__identity' },
      el('h1', { class: 'card__title', text: fmt.variantLabel(doc.variant) }),
      el(
        'p',
        { class: 'card__meta' },
        rsidChip(doc.variant.rsid),
        el('span', {
          class: 'card__chip card__chip--quiet',
          text: t('heatmap.meta.counts', {
            biosamples: doc.biosamples.length,
            modalities: doc.modalities.length,
          }),
        }),
        sourceChip(doc.provenance),
      ),
    ),
    provenanceStrip(doc.provenance),
    panel(
      {
        title: t('heatmap.panel.title'),
        subtitle: t('heatmap.panel.subtitle', { covered, total, trimmedNote: trimmed }),
        hint: t('heatmap.panel.hint'),
      },
      el('div', {}, legendSlot, slot),
    ),
    predictionNotice(),
  );

  const stopResize = onResize(slot, draw);
  const stopTheme = onThemeChange(() => draw(slot.clientWidth || 720));
  draw(slot.clientWidth || 720);

  return () => {
    stopResize();
    stopTheme();
    tooltip().hide();
  };
}
