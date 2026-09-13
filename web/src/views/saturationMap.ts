/**
 * N1 — Mapa de saturacion.
 *
 * Para cada posicion de la ventana, el AVI de las TRES bases alternativas
 * posibles. Es el grafico insignia de la genomica con aprendizaje profundo y no
 * existia en navegador para AlphaGenome.
 *
 * Lo que deja ver: donde el modelo cree que la secuencia importa y donde le da
 * igual. Los motivos aparecen solos, como columnas contiguas de color fuerte,
 * sin que nadie se los marque.
 *
 * Por que escala SECUENCIAL y no divergente
 * -----------------------------------------
 * El sistema visual reserva la divergente para diferencias REF/ALT, y el mapa
 * de saturacion parece una de ellas. No lo es: el AVI mide IMPACTO, no
 * direccion. Su PHRED va de cero a arriba y no tiene polo negativo, asi que
 * pintarlo con una divergente inventaria un eje que el dato no tiene. Se usa la
 * secuencial, que es la escala de magnitud.
 *
 * El artefacto trae ademas el score crudo CON signo, por si una vista futura
 * quiere la divergente sobre esa otra cantidad; el dato esta, la decision de
 * como pintarlo es de cada vista.
 */

import { clear, el, onResize, onThemeChange, setupCanvas, svg, token } from '../lib/dom';
import * as fmt from '../lib/format';
import { nucleotideColor, sequentialScale } from '../lib/color';
import { panel, predictionNotice, provenanceStrip, sourceChip, tooltip } from '../lib/ui';
import type { AnnotationsDoc, LocusDoc, SaturationDoc } from '../lib/types';

const ROW_HEIGHT = 26;
const LABEL_WIDTH = 34;
const RIGHT_PAD = 8;
const AXIS_HEIGHT = 22;
const SEQUENCE_HEIGHT = 16;
const GENE_HEIGHT = 32;
const SUMMARY_HEIGHT = 14;
/** Fila resumen con el maximo de las tres alternativas de cada posicion.

Es lo que hace visible el patron que la vista existe para mostrar: con las tres
filas sueltas, una posicion importante se reparte en tres celdas medianas y se
pierde entre el ruido; condensada en una sola barra, el motivo aparece como un
bloque contiguo. */
/** Por debajo de esto una letra de secuencia no cabe y se pinta una banda. */
const MIN_PX_FOR_LETTERS = 7;

interface Hit {
  row: number;
  column: number;
}

export function renderSaturationMap(
  container: HTMLElement,
  doc: SaturationDoc,
  locus: LocusDoc,
  annotations: AnnotationsDoc | null,
  onOpenVariant: (variantId: string) => void,
): () => void {
  const columns = doc.reference.length;
  const rows = doc.alts.length;

  const canvas = el('canvas', { class: 'saturation__canvas' });
  const overlay = svg('svg', { class: 'saturation__overlay' });
  const stage = el(
    'div',
    { class: 'saturation__stage' },
    canvas,
    overlay as unknown as HTMLElement,
  );
  const readout = el('p', { class: 'saturation__readout' });
  const body = el('div', { class: 'saturation__body' }, readout, stage);

  let width = 900;
  let selected: Hit | null = null;
  const tip = tooltip();

  const maxPhred = doc.maxPhred && doc.maxPhred > 0 ? doc.maxPhred : 1;

  function plotWidth(): number {
    return Math.max(200, width - LABEL_WIDTH - RIGHT_PAD);
  }

  function cellWidth(): number {
    return plotWidth() / columns;
  }

  const GRID_TOP = GENE_HEIGHT + SUMMARY_HEIGHT;

  function hitAt(clientX: number, clientY: number): Hit | null {
    const box = stage.getBoundingClientRect();
    const x = clientX - box.left - LABEL_WIDTH;
    const y = clientY - box.top - GRID_TOP;
    if (x < 0 || y < 0) return null;
    const column = Math.floor(x / cellWidth());
    const row = Math.floor(y / ROW_HEIGHT);
    if (column < 0 || column >= columns || row < 0 || row >= rows) return null;
    return { row, column };
  }

  function variantIdAt(hit: Hit): string | null {
    const refBase = doc.reference[hit.column];
    const altBase = doc.alts[hit.row];
    if (!refBase || !altBase || refBase === altBase) return null;
    const position = doc.interval.start + hit.column + 1;
    return `${doc.interval.chromosome}-${position}-${refBase}-${altBase}`;
  }

  function draw(): void {
    const cw = cellWidth();
    const gridHeight = rows * ROW_HEIGHT;
    const height =
      GENE_HEIGHT + SUMMARY_HEIGHT + gridHeight + SEQUENCE_HEIGHT + AXIS_HEIGHT;

    const ctx = setupCanvas(canvas, width, height);
    ctx.clearRect(0, 0, width, height);

    const scale = sequentialScale(maxPhred);
    const surface = token('--surface');
    const rule = token('--rule');

    // --- fila resumen: maximo de las tres alternativas --------------------
    for (let c = 0; c < columns; c++) {
      let best: number | null = null;
      for (let r = 0; r < rows; r++) {
        if (doc.reference[c] === doc.alts[r]) continue;
        const value = doc.phred[r]?.[c];
        if (value !== null && value !== undefined && (best === null || value > best)) {
          best = value;
        }
      }
      ctx.fillStyle = best === null ? surface : scale(best);
      ctx.fillRect(
        LABEL_WIDTH + c * cw,
        GENE_HEIGHT + 1,
        Math.max(1, cw),
        SUMMARY_HEIGHT - 3,
      );
    }

    // --- rejilla ---------------------------------------------------------
    for (let r = 0; r < rows; r++) {
      const alt = doc.alts[r]!;
      for (let c = 0; c < columns; c++) {
        const x = LABEL_WIDTH + c * cw;
        const y = GRID_TOP + r * ROW_HEIGHT;
        const value = doc.phred[r]?.[c] ?? null;
        if (doc.reference[c] === alt) {
          // La celda de la propia referencia no es una variante. Se deja en el
          // color de fondo con una marca tenue, para que la fila de referencia
          // se lea como hueco y no como un cero.
          ctx.fillStyle = surface;
          ctx.fillRect(x, y, Math.max(1, cw), ROW_HEIGHT - 1);
          ctx.fillStyle = rule;
          ctx.fillRect(x, y + ROW_HEIGHT / 2 - 1, Math.max(1, cw), 1);
          continue;
        }
        if (value === null) {
          ctx.fillStyle = surface;
          ctx.fillRect(x, y, Math.max(1, cw), ROW_HEIGHT - 1);
          continue;
        }
        ctx.fillStyle = scale(value);
        ctx.fillRect(x, y, Math.max(1, cw), ROW_HEIGHT - 1);
      }
    }

    // --- banda de secuencia de referencia --------------------------------
    const seqY = GRID_TOP + gridHeight + 2;
    if (cw >= MIN_PX_FOR_LETTERS) {
      ctx.font = `${Math.min(12, Math.floor(cw))}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let c = 0; c < columns; c++) {
        const base = doc.reference[c]!;
        ctx.fillStyle = nucleotideColor(base);
        ctx.fillText(base, LABEL_WIDTH + c * cw + cw / 2, seqY + SEQUENCE_HEIGHT / 2);
      }
    } else {
      // Sin sitio para letras, la secuencia se muestra como banda de color: se
      // sigue viendo la composicion sin fingir que se puede leer.
      for (let c = 0; c < columns; c++) {
        ctx.fillStyle = nucleotideColor(doc.reference[c]!);
        ctx.fillRect(LABEL_WIDTH + c * cw, seqY + 3, Math.max(1, cw), SEQUENCE_HEIGHT - 6);
      }
    }

    // --- superposicion SVG ----------------------------------------------
    overlay.setAttribute('width', String(width));
    overlay.setAttribute('height', String(height));
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    clear(overlay as unknown as Element);

    for (let r = 0; r < rows; r++) {
      overlay.append(
        svg('text', {
          x: String(LABEL_WIDTH - 8),
          y: String(GRID_TOP + r * ROW_HEIGHT + ROW_HEIGHT / 2 + 4),
          class: 'saturation__row-label',
          'text-anchor': 'end',
          fill: nucleotideColor(doc.alts[r]!),
          text: doc.alts[r]!,
        }),
      );
    }
    overlay.append(
      svg('text', {
        x: String(LABEL_WIDTH - 8),
        y: String(GENE_HEIGHT + SUMMARY_HEIGHT - 3),
        class: 'saturation__row-label saturation__row-label--quiet',
        'text-anchor': 'end',
        text: 'max',
      }),
    );
    overlay.append(
      svg('text', {
        x: String(LABEL_WIDTH - 8),
        y: String(seqY + SEQUENCE_HEIGHT / 2 + 4),
        class: 'saturation__row-label saturation__row-label--quiet',
        'text-anchor': 'end',
        text: 'ref',
      }),
    );

    // Eje de coordenadas.
    const axisY = seqY + SEQUENCE_HEIGHT + AXIS_HEIGHT - 6;
    const firstBase = doc.interval.start + 1;
    for (const value of fmt.niceTicks(
      firstBase,
      firstBase + columns - 1,
      Math.max(2, Math.floor(plotWidth() / 130)),
    )) {
      const x = LABEL_WIDTH + (value - firstBase + 0.5) * cw;
      if (x < LABEL_WIDTH) continue;
      overlay.append(
        svg('line', {
          x1: String(x),
          x2: String(x),
          y1: String(axisY - 10),
          y2: String(axisY - 6),
          class: 'saturation__tick',
        }),
        svg('text', {
          x: String(x),
          y: String(axisY + 2),
          class: 'saturation__tick-label',
          'text-anchor': 'middle',
          text: fmt.int(Math.round(value)),
        }),
      );
    }

    // Estructura genica sobre la rejilla.
    if (annotations?.genes.length) {
      // Dos genes que solapan escriben su nombre encima del otro. Se alternan
      // en dos alturas, que basta para los pocos que caben en 512 pb.
      let laneIndex = 0;
      for (const gene of annotations.genes) {
        if (gene.end < doc.interval.start || gene.start > doc.interval.end) continue;
        const x0 = Math.max(
          LABEL_WIDTH,
          LABEL_WIDTH + (gene.start - doc.interval.start) * cw,
        );
        const x1 = Math.min(
          LABEL_WIDTH + plotWidth(),
          LABEL_WIDTH + (gene.end - doc.interval.start) * cw,
        );
        const laneY = GENE_HEIGHT - 8 - (laneIndex % 2) * 12;
        laneIndex += 1;
        overlay.append(
          svg('line', {
            x1: String(x0),
            x2: String(x1),
            y1: String(laneY),
            y2: String(laneY),
            class: 'saturation__gene-body',
          }),
          svg('text', {
            x: String(Math.max(LABEL_WIDTH + 2, x0 + 4)),
            y: String(laneY - 3),
            class: 'saturation__gene-label',
            text: `${gene.name} ${gene.strand}`,
          }),
        );
        for (const transcript of gene.transcripts ?? []) {
          for (const [exonStart, exonEnd] of transcript.exons) {
            if (exonEnd < doc.interval.start || exonStart > doc.interval.end) continue;
            const ex0 = LABEL_WIDTH + (exonStart - doc.interval.start) * cw;
            const ex1 = LABEL_WIDTH + (exonEnd - doc.interval.start) * cw;
            overlay.append(
              svg('rect', {
                x: String(Math.max(LABEL_WIDTH, ex0)),
                y: String(laneY - 4),
                width: String(
                  Math.max(1, Math.min(LABEL_WIDTH + plotWidth(), ex1) - Math.max(LABEL_WIDTH, ex0)),
                ),
                height: '8',
                class: 'saturation__exon',
              }),
            );
          }
        }
      }
    }

    // Marca de la variante que ancla la ventana.
    if (doc.focus) {
      const c = doc.focus - 1 - doc.interval.start;
      if (c >= 0 && c < columns) {
        overlay.append(
          svg('rect', {
            x: String(LABEL_WIDTH + c * cw - 1),
            y: String(GENE_HEIGHT),
            width: String(Math.max(2, cw + 2)),
            height: String(SUMMARY_HEIGHT + gridHeight + 2),
            class: 'saturation__focus',
          }),
        );
      }
    }

    if (selected) {
      overlay.append(
        svg('rect', {
          x: String(LABEL_WIDTH + selected.column * cw - 0.5),
          y: String(GRID_TOP + selected.row * ROW_HEIGHT - 0.5),
          width: String(Math.max(2, cw + 1)),
          height: String(ROW_HEIGHT),
          class: 'saturation__selected',
        }),
      );
    }
  }

  // --- interaccion --------------------------------------------------------

  function describe(event: MouseEvent): void {
    const hit = hitAt(event.clientX, event.clientY);
    if (!hit) {
      tip.hide();
      return;
    }
    const refBase = doc.reference[hit.column]!;
    const altBase = doc.alts[hit.row]!;
    const position = doc.interval.start + hit.column + 1;
    if (refBase === altBase) {
      tip.show(
        fmt.coordinate(doc.interval.chromosome, position),
        [{ label: 'Base de referencia', value: refBase, emphasis: true },
         { label: '', value: 'no es una variante' }],
        event.clientX,
        event.clientY,
      );
      return;
    }
    const phred = doc.phred[hit.row]?.[hit.column];
    const raw = doc.raw?.[hit.row]?.[hit.column];
    tip.show(
      `${fmt.coordinate(doc.interval.chromosome, position)} ${refBase}>${altBase}`,
      [
        {
          label: 'AVI PHRED',
          value: phred === null || phred === undefined ? 'sin dato' : fmt.fixed2(phred),
          swatch: phred ? sequentialScale(maxPhred)(phred) : undefined,
          emphasis: true,
        },
        ...(phred !== null && phred !== undefined
          ? [{ label: 'Lectura', value: fmt.phredMeaning(phred) }]
          : []),
        ...(raw !== null && raw !== undefined
          ? [{ label: 'Score crudo', value: fmt.signed2(raw) }]
          : []),
        { label: '', value: 'clic para la ficha' },
      ],
      event.clientX,
      event.clientY,
    );
  }

  function onClick(event: MouseEvent): void {
    const hit = hitAt(event.clientX, event.clientY);
    if (!hit) return;
    selected = hit;
    draw();

    const variantId = variantIdAt(hit);
    if (!variantId) {
      // Es la celda de la propia referencia. Antes no pasaba nada y el silencio
      // se parece demasiado a un fallo; ahora lo dice.
      const position = doc.interval.start + hit.column + 1;
      clear(readout);
      readout.append(
        el('span', {
          class: 'saturation__readout-strong',
          text: fmt.coordinate(doc.interval.chromosome, position),
        }),
        el('span', {
          text: `  base de referencia ${doc.reference[hit.column]}: no es una variante`,
        }),
      );
      return;
    }

    const known = locus.variants.some((v) => v.variant.id === variantId);
    if (known) {
      onOpenVariant(variantId);
      return;
    }
    // La mayoria de las variantes del mapa no tienen ficha congelada: son
    // ~1.500 y el pipeline congela unas pocas. Decirlo es mejor que un enlace
    // que no lleva a ningun sitio.
    const position = doc.interval.start + hit.column + 1;
    const phred = doc.phred[hit.row]?.[hit.column];
    clear(readout);
    readout.append(
      el('span', {
        class: 'saturation__readout-strong',
        text: `${fmt.coordinate(doc.interval.chromosome, position)} ` +
          `${doc.reference[hit.column]}>${doc.alts[hit.row]}`,
      }),
      el('span', {
        text:
          phred === null || phred === undefined
            ? '  sin dato'
            : `  AVI PHRED ${fmt.fixed2(phred)} · ${fmt.phredMeaning(phred)}` +
              '  ·  sin ficha congelada: el pipeline congela unas pocas variantes por locus',
      }),
    );
  }

  // --- montaje ------------------------------------------------------------

  const coverage =
    doc.coverage !== null && doc.coverage !== undefined
      ? ` · ${(doc.coverage * 100).toFixed(0)} % de celdas con dato`
      : '';

  readout.textContent =
    `${fmt.intervalLabel(doc.interval.chromosome, doc.interval.start, doc.interval.end)}` +
    ` · ${columns} posiciones × 3 alternativas${coverage}`;

  container.append(
    provenanceStrip(doc.provenance),
    panel(
      {
        title: 'Mapa de saturacion',
        subtitle: 'El AVI de las tres bases alternativas en cada posicion',
        actions: [sourceChip(doc.provenance)],
        hint:
          'Cada columna es una posicion y cada fila una base alternativa. Cuanto ' +
          'mas oscura la celda, mas alto el AVI. Una columna oscura entera ' +
          'significa que cambiar esa base importa, sea cual sea el cambio: asi es ' +
          'como aparecen los motivos. La escala es secuencial y no divergente ' +
          'porque el AVI mide impacto, no direccion.',
      },
      el('div', {}, body, legend(maxPhred)),
    ),
    predictionNotice(),
  );

  stage.addEventListener('mousemove', describe);
  stage.addEventListener('mouseleave', () => tip.hide());
  stage.addEventListener('click', onClick);

  const stopResize = onResize(body, (w) => {
    width = w;
    draw();
  });
  const stopTheme = onThemeChange(draw);
  draw();

  return () => {
    stopResize();
    stopTheme();
    tip.hide();
  };
}

/** Leyenda de la escala secuencial, con el PHRED interpretado. */
function legend(maxPhred: number): HTMLElement {
  const scale = sequentialScale(maxPhred);
  const steps = 40;
  const root = svg('svg', {
    class: 'legend',
    width: '260',
    height: '46',
    viewBox: '0 0 260 46',
    role: 'img',
    'aria-label': `Escala secuencial de AVI PHRED, de 0 a ${maxPhred.toFixed(1)}.`,
  });
  root.append(
    svg('text', { x: '0', y: '11', class: 'legend__title', text: 'AVI PHRED · impacto' }),
  );
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    root.append(
      svg('rect', {
        x: String(t * 236),
        y: '18',
        width: String(236 / steps + 1),
        height: '9',
        fill: scale(t * maxPhred),
      }),
    );
  }
  for (const [value, anchor] of [
    [0, 'start'],
    [maxPhred / 2, 'middle'],
    [maxPhred, 'end'],
  ] as const) {
    const x = (value / maxPhred) * 236;
    root.append(
      svg('text', {
        x: String(x),
        y: '41',
        class: 'legend__label',
        'text-anchor': anchor,
        text: value.toFixed(1),
      }),
    );
  }
  return el(
    'div',
    { class: 'saturation__legend' },
    root as unknown as HTMLElement,
    // El texto va FUERA del SVG. Dentro, un viewBox fijo lo recorta en cuanto
    // crece; fuera fluye y se ajusta al ancho que haya.
    el('p', { class: 'saturation__legend-note', text: fmt.PHRED_LEGEND }),
  );
}
