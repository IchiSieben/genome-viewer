/**
 * V3 — Navegador de tracks.
 *
 * Senal predicha REF contra ALT a lo largo del locus, por modalidad, con
 * anotacion de genes debajo y un eje de coordenadas real. Zoom y desplazamiento;
 * al acercarse mas alla de cierto umbral cambia al bloque de resolucion de 1 pb.
 *
 * La decision de rendimiento que define esta vista: **canvas para la senal densa
 * y SVG por encima para todo lo demas**. Ocho mil puntos por track por lane en
 * SVG serian decenas de miles de nodos y el navegador se atraganta; en canvas
 * son un camino por lane. Los ejes, los genes, el crosshair y las zonas
 * interactivas siguen en SVG, que es donde hay eventos y accesibilidad.
 *
 * Lo que se dibuja entre las dos lineas no es decoracion: el area sombreada
 * ENTRE REF y ALT, coloreada por el signo de la diferencia, es exactamente lo
 * que la variante hace. Dos lineas superpuestas sin ese relleno obligan al ojo
 * a medir distancias verticales pequenas, que es justo lo que el ojo hace mal.
 */

import { clear, el, onResize, onThemeChange, setupCanvas, svg, token } from '../lib/dom';
import * as fmt from '../lib/format';
import { MODALITY_ORDER, modalityColor } from '../lib/color';
import { emptyState, errorState, loadingState, panel, predictionNotice, provenanceStrip, sourceChip, tooltip } from '../lib/ui';
import { altOf } from '../lib/signal';
import type { DecodedBlock, DecodedTrack } from '../lib/signal';
import { loadAnnotations, loadSignal } from '../lib/data';
import type { AnnotationsDoc, LocusDoc, Variant } from '../lib/types';

const LANE_HEIGHT = 58;
const LANE_GAP = 6;
const AXIS_HEIGHT = 28;
const GENE_LANE_HEIGHT = 72;
const LABEL_WIDTH = 132;
const RIGHT_PAD = 12;
/** Menos de esto en pantalla y conviene el bloque de 1 pb, si lo cubre. */
const DETAIL_THRESHOLD_BP = 8192;
const MIN_SPAN_BP = 120;

interface Viewport {
  start: number;
  end: number;
}

interface LaneData {
  modality: string;
  track: DecodedTrack;
  ref: Float32Array;
  alt: Float32Array;
  /** Intervalo que cubre el arreglo, y cuantos pb vale cada muestra. */
  origin: number;
  binSize: number;
  level: 'overview' | 'detail';
}

/** Convierte coordenada genomica a pixel y al reves. */
function makeScale(view: Viewport, plotWidth: number) {
  const span = view.end - view.start;
  return {
    toPixel: (bp: number) => LABEL_WIDTH + ((bp - view.start) / span) * plotWidth,
    toBp: (px: number) => view.start + ((px - LABEL_WIDTH) / plotWidth) * span,
  };
}

/**
 * Dibuja una lane en el canvas.
 *
 * Recorre PIXELES, no muestras: por cada columna de pantalla busca el rango de
 * muestras que le toca y se queda con su minimo y su maximo. Es lo que evita
 * que al alejar el zoom un pico estrecho desaparezca por submuestreo, y es
 * tambien lo que hace que el coste sea proporcional al ancho en pixeles y no al
 * tamano del arreglo.
 */
function drawLane(
  ctx: CanvasRenderingContext2D,
  lane: LaneData,
  view: Viewport,
  plotWidth: number,
  top: number,
  height: number,
  colors: { ref: string; alt: string; pos: string; neg: string; grid: string },
): void {
  const columns = Math.max(1, Math.floor(plotWidth));
  const refMin = new Float32Array(columns);
  const refMax = new Float32Array(columns);
  const altMin = new Float32Array(columns);
  const altMax = new Float32Array(columns);
  const filled = new Uint8Array(columns);

  const span = view.end - view.start;
  const n = lane.ref.length;

  let lo = Infinity;
  let hi = -Infinity;

  for (let c = 0; c < columns; c++) {
    const bpStart = view.start + (c / columns) * span;
    const bpEnd = view.start + ((c + 1) / columns) * span;
    const rawStart = Math.floor((bpStart - lane.origin) / lane.binSize);
    const rawEnd = Math.ceil((bpEnd - lane.origin) / lane.binSize);
    // El rango se comprueba ANTES de recortarlo. Recortar primero convertiria
    // una columna que cae fuera de los datos en el indice 0, y se dibujaria un
    // valor inventado como si fuera senal medida.
    if (rawEnd <= 0 || rawStart >= n) continue;
    const i0 = Math.max(0, Math.min(n - 1, rawStart));
    const i1 = Math.max(i0 + 1, Math.min(n, rawEnd));

    let rmin = Infinity;
    let rmax = -Infinity;
    let amin = Infinity;
    let amax = -Infinity;
    for (let i = i0; i < i1; i++) {
      const r = lane.ref[i]!;
      const a = lane.alt[i]!;
      if (r < rmin) rmin = r;
      if (r > rmax) rmax = r;
      if (a < amin) amin = a;
      if (a > amax) amax = a;
    }
    refMin[c] = rmin;
    refMax[c] = rmax;
    altMin[c] = amin;
    altMax[c] = amax;
    filled[c] = 1;
    if (rmin < lo) lo = rmin;
    if (amin < lo) lo = amin;
    if (rmax > hi) hi = rmax;
    if (amax > hi) hi = amax;
  }

  if (lo === Infinity) return;
  // El eje arranca en cero cuando la senal es no negativa: una senal de
  // cobertura dibujada sin el cero exagera cualquier variacion pequena.
  if (lo > 0) lo = 0;
  const range = hi - lo || 1;
  const y = (value: number) => top + height - ((value - lo) / range) * height;

  ctx.save();
  ctx.beginPath();
  ctx.rect(LABEL_WIDTH, top, plotWidth, height);
  ctx.clip();

  // Linea del cero, si cae dentro.
  if (lo <= 0 && hi >= 0) {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH, Math.round(y(0)) + 0.5);
    ctx.lineTo(LABEL_WIDTH + plotWidth, Math.round(y(0)) + 0.5);
    ctx.stroke();
  }

  // Area entre REF y ALT, por tramos del mismo signo. Se pinta por columna
  // porque el signo puede cambiar de una a otra.
  for (let c = 0; c < columns; c++) {
    if (!filled[c]) continue;
    const rMid = (refMin[c]! + refMax[c]!) / 2;
    const aMid = (altMin[c]! + altMax[c]!) / 2;
    if (Math.abs(aMid - rMid) < range * 1e-4) continue;
    ctx.fillStyle = aMid >= rMid ? colors.pos : colors.neg;
    const yr = y(rMid);
    const ya = y(aMid);
    ctx.fillRect(LABEL_WIDTH + c, Math.min(yr, ya), 1, Math.abs(ya - yr));
  }

  // REF: envolvente min-max, para no perder picos al alejar el zoom.
  ctx.strokeStyle = colors.ref;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c < columns; c++) {
    if (!filled[c]) continue;
    const x = LABEL_WIDTH + c + 0.5;
    ctx.moveTo(x, y(refMin[c]!));
    ctx.lineTo(x, y(refMax[c]!));
  }
  ctx.stroke();

  // ALT encima, en el color de la modalidad.
  ctx.strokeStyle = colors.alt;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  let started = false;
  for (let c = 0; c < columns; c++) {
    if (!filled[c]) {
      started = false;
      continue;
    }
    const x = LABEL_WIDTH + c + 0.5;
    const yv = y((altMin[c]! + altMax[c]!) / 2);
    if (started) ctx.lineTo(x, yv);
    else {
      ctx.moveTo(x, yv);
      started = true;
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Eje de coordenadas con marcas redondas y separador de millar. */
function drawAxis(view: Viewport, plotWidth: number, chromosome: string): SVGGElement {
  const group = svg('g', { class: 'browser__axis' });
  const scale = makeScale(view, plotWidth);
  const span = view.end - view.start;
  const count = Math.max(2, Math.min(9, Math.floor(plotWidth / 110)));

  for (const value of fmt.niceTicks(view.start, view.end, count)) {
    const x = scale.toPixel(value);
    if (x < LABEL_WIDTH - 1) continue;
    group.append(
      svg('line', {
        x1: String(x),
        x2: String(x),
        y1: String(AXIS_HEIGHT - 6),
        y2: String(AXIS_HEIGHT),
        class: 'browser__tick',
      }),
      svg('text', {
        x: String(x),
        y: String(AXIS_HEIGHT - 10),
        class: 'browser__tick-label',
        'text-anchor': 'middle',
        text: fmt.int(Math.round(value)),
      }),
    );
  }

  group.append(
    svg('text', {
      x: '0',
      y: String(AXIS_HEIGHT - 10),
      class: 'browser__axis-title',
      text: `${chromosome} · ${fmt.span(span)}`,
    }),
  );
  return group;
}

/**
 * Carril de genes y transcritos, con exones y sentido de la hebra.
 *
 * Reparto en sub-carriles
 * -----------------------
 * Un locus de 1 Mb trae del orden de 45 genes anotados. Dibujarlos todos en una
 * linea deja los nombres unos encima de otros y el carril se vuelve ilegible:
 * medido en el sitio desplegado, no supuesto. Aqui se empaquetan en sub-carriles
 * de forma que dos genes solo comparten carril si NO se solapan en pantalla, y
 * la etiqueta solo se escribe si de verdad cabe en el ancho del gen.
 */
const GENE_LANE_STEP = 15;
const MAX_GENE_LANES = 3;
/** Ancho aproximado de un caracter a 10 px en la tipografia de la etiqueta. */
const LABEL_CHAR_PX = 5.4;

function drawGenes(
  annotations: AnnotationsDoc | null,
  view: Viewport,
  plotWidth: number,
  top: number,
): SVGGElement {
  const group = svg('g', { class: 'browser__genes' });
  group.append(
    svg('text', {
      x: String(LABEL_WIDTH - 10),
      y: String(top + 16),
      class: 'browser__lane-label',
      'text-anchor': 'end',
      text: 'Genes',
    }),
  );

  if (!annotations?.genes.length) {
    group.append(
      svg('text', {
        x: String(LABEL_WIDTH + 8),
        y: String(top + 16),
        class: 'browser__empty-note',
        text: 'Sin anotacion disponible para este locus.',
      }),
    );
    return group;
  }

  const scale = makeScale(view, plotWidth);
  const right = LABEL_WIDTH + plotWidth;

  // Solo lo que se ve, ordenado por inicio: el empaquetado necesita orden.
  const visible = annotations.genes
    .filter((g) => g.end >= view.start && g.start <= view.end)
    .map((gene) => ({
      gene,
      x0: Math.max(LABEL_WIDTH, scale.toPixel(gene.start)),
      x1: Math.min(right, scale.toPixel(gene.end)),
    }))
    .sort((a, b) => a.x0 - b.x0);

  // Empaquetado: un gen entra en el primer sub-carril cuyo ultimo ocupante
  // termine antes de que este empiece. Se reserva sitio para la etiqueta.
  const laneEnds: number[] = [];
  let hidden = 0;

  for (const item of visible) {
    const label = `${item.gene.name} ${item.gene.strand}`;
    const labelPx = label.length * LABEL_CHAR_PX;
    const needed = Math.max(item.x1, item.x0 + labelPx) + 6;

    let lane = laneEnds.findIndex((end) => end <= item.x0);
    if (lane === -1) {
      if (laneEnds.length >= MAX_GENE_LANES) {
        hidden += 1;
        continue;
      }
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = needed;

    const y = top + 14 + lane * GENE_LANE_STEP;

    group.append(
      svg('line', {
        x1: String(item.x0),
        x2: String(item.x1),
        y1: String(y),
        y2: String(y),
        class: 'browser__gene-body',
      }),
    );

    // Marcas de sentido: un gen sin hebra indicada es una convencion rota en
    // cualquier navegador genomico.
    const step = 34;
    for (let x = item.x0 + step / 2; x < item.x1; x += step) {
      const d = item.gene.strand === '-' ? -3.5 : 3.5;
      group.append(
        svg('path', {
          d: `M ${x - d} ${y - 3} L ${x + d} ${y} L ${x - d} ${y + 3}`,
          class: 'browser__gene-arrow',
        }),
      );
    }

    for (const transcript of item.gene.transcripts ?? []) {
      for (const [exonStart, exonEnd] of transcript.exons) {
        const ex0 = scale.toPixel(exonStart);
        const ex1 = scale.toPixel(exonEnd);
        if (ex1 < LABEL_WIDTH || ex0 > right) continue;
        group.append(
          svg('rect', {
            x: String(Math.max(LABEL_WIDTH, ex0)),
            y: String(y - 4),
            width: String(
              Math.max(1, Math.min(right, ex1) - Math.max(LABEL_WIDTH, ex0)),
            ),
            height: '8',
            class: 'browser__exon',
          }),
        );
      }
    }

    // La etiqueta solo si cabe. Un nombre que se sale y se superpone con el
    // vecino informa menos que no estar.
    if (item.x1 - item.x0 >= labelPx * 0.55) {
      group.append(
        svg('text', {
          x: String(item.x0 + 2),
          y: String(y - 6),
          class: 'browser__gene-label',
          text: label,
        }),
      );
    }
  }

  if (hidden > 0) {
    group.append(
      svg('text', {
        x: String(right),
        y: String(top + 14 + MAX_GENE_LANES * GENE_LANE_STEP + 4),
        class: 'browser__empty-note',
        'text-anchor': 'end',
        text: `+${hidden} genes mas, acerca el zoom para verlos`,
      }),
    );
  }

  return group;
}

/** El navegador completo. Devuelve su funcion de limpieza. */
export function renderTrackBrowser(
  container: HTMLElement,
  locus: LocusDoc,
  locusPath: string,
  variant: Variant | null,
  variantSignals?: LocusDoc['variants'][number]['signals'],
  urlState?: {
    /** Modalidades que pedia la URL, si las pedia. */
    tracks?: string[];
    /** Ventana de zoom que pedia la URL, en pares de bases. */
    window?: { start: number; end: number };
    /** Publica el estado sin provocar una navegacion. */
    publish: (state: { tracks: string[]; start: number; end: number }) => void;
  },
): () => void {
  // El delta REF/ALT es de la variante, no del locus: se prefieren sus bloques
  // y solo se cae a los del locus si no los tiene.
  const signals = variantSignals ?? locus.signals;
  if (!signals?.overview) {
    container.append(
      emptyState(
        'Este locus no tiene bloques de senal congelados.',
        'El pipeline los emite con el comando fixtures o con una corrida real.',
      ),
    );
    return () => {};
  }

  const overview = signals.overview;
  const detail = signals.detail;
  const available = MODALITY_ORDER.filter((m) => m in overview.modalities);
  // La URL manda sobre el valor por defecto: asi un enlace compartido abre
  // exactamente la misma pantalla, que es el punto de tener estado en la URL.
  const fromUrl = (urlState?.tracks ?? []).filter((m) => available.includes(m as never));
  const selected = new Set<string>(
    fromUrl.length ? fromUrl : available.slice(0, 3),
  );

  const blocks = new Map<string, DecodedBlock>();
  let annotations: AnnotationsDoc | null = null;

  const full: Viewport = { start: overview.interval.start, end: overview.interval.end };
  let view: Viewport = { ...full };
  if (urlState?.window) {
    const { start, end } = urlState.window;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      view = {
        start: Math.max(full.start, Math.floor(start)),
        end: Math.min(full.end, Math.ceil(end)),
      };
    }
  }

  const canvas = el('canvas', { class: 'browser__canvas' });
  const overlay = svg('svg', { class: 'browser__overlay' });
  const stage = el('div', { class: 'browser__stage' }, canvas, overlay as unknown as HTMLElement);
  const status = el('p', { class: 'browser__status' });
  const chips = el('div', { class: 'browser__chips' });
  const body = el('div', { class: 'browser__body' }, status, stage);

  let width = 900;
  let disposed = false;
  const tip = tooltip();

  // ---- Presupuesto de frames ---------------------------------------------
  // Un render por FRAME como maximo, nunca uno por evento de rueda o de
  // movimiento. Sin esto, una rueda rapida encola decenas de redibujados
  // completos y el visor se siente pegajoso justo cuando se le pide fluidez.
  let renderPending = false;
  let lastFrameMs = 0;

  function scheduleDraw(): void {
    if (renderPending || disposed) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      const t0 = performance.now();
      draw();
      lastFrameMs = performance.now() - t0;
    });
  }

  // ---- Transformacion durante el gesto -----------------------------------
  // Mientras el gesto esta vivo se aplica una transformacion barata sobre el
  // bitmap ya dibujado; el redibujado a resolucion completa espera a que el
  // gesto se asiente. Es la diferencia entre arrastrar a 60 fps y arrastrar a
  // la velocidad a la que se sepa recalcular 8192 muestras por lane.
  let settleTimer = 0;
  let gestureScale = 1;
  let gestureShift = 0;

  function applyGestureTransform(): void {
    const origin = LABEL_WIDTH;
    canvas.style.transformOrigin = `${origin}px 0`;
    canvas.style.transform =
      gestureScale === 1 && gestureShift === 0
        ? ''
        : `translateX(${gestureShift}px) scaleX(${gestureScale})`;
  }

  function settle(): void {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      gestureScale = 1;
      gestureShift = 0;
      applyGestureTransform();
      void ensureBlocks().then(scheduleDraw);
    }, 140);
  }

  function lanes(): LaneData[] {
    const out: LaneData[] = [];
    const span = view.end - view.start;
    for (const modality of available) {
      if (!selected.has(modality)) continue;
      const useDetail =
        !!detail &&
        span <= DETAIL_THRESHOLD_BP &&
        view.start < detail.interval.end &&
        view.end > detail.interval.start &&
        blocks.has(`detail:${modality}`);
      const key = useDetail ? `detail:${modality}` : `overview:${modality}`;
      const block = blocks.get(key);
      if (!block) continue;
      const level = useDetail ? 'detail' : 'overview';
      const source = useDetail ? detail! : overview;
      for (const track of block.tracks) {
        out.push({
          modality,
          track,
          ref: track.ref,
          alt: altOf(track),
          origin: source.interval.start,
          binSize: source.binSize,
          level,
        });
      }
    }
    return out;
  }

  function plotWidth(): number {
    return Math.max(240, width - LABEL_WIDTH - RIGHT_PAD);
  }

  function draw(): void {
    if (disposed) return;
    const data = lanes();
    const pw = plotWidth();
    const height = AXIS_HEIGHT + data.length * (LANE_HEIGHT + LANE_GAP) + GENE_LANE_HEIGHT;

    const ctx = setupCanvas(canvas, width, height);
    ctx.clearRect(0, 0, width, height);

    const colors = {
      ref: token('--ink-faint'),
      pos: token('--div-pos-1'),
      neg: token('--div-neg-1'),
      grid: token('--rule'),
      alt: '',
    };

    data.forEach((lane, i) => {
      const top = AXIS_HEIGHT + i * (LANE_HEIGHT + LANE_GAP);
      drawLane(ctx, lane, view, pw, top, LANE_HEIGHT, {
        ...colors,
        alt: modalityColor(lane.modality),
      });
    });

    overlay.setAttribute('width', String(width));
    overlay.setAttribute('height', String(height));
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    clear(overlay as unknown as Element);
    overlay.append(drawAxis(view, pw, locus.interval.chromosome));

    data.forEach((lane, i) => {
      const top = AXIS_HEIGHT + i * (LANE_HEIGHT + LANE_GAP);
      overlay.append(
        svg('text', {
          x: String(LABEL_WIDTH - 10),
          y: String(top + 16),
          class: 'browser__lane-label',
          'text-anchor': 'end',
          text: lane.track.header.biosample ?? lane.modality,
        }),
        svg('text', {
          x: String(LABEL_WIDTH - 10),
          y: String(top + 29),
          class: 'browser__lane-sub',
          'text-anchor': 'end',
          text: `${lane.modality}${
            lane.track.header.strand && lane.track.header.strand !== '.'
              ? ` ${lane.track.header.strand}`
              : ''
          }`,
        }),
        svg('line', {
          x1: String(LABEL_WIDTH),
          x2: String(LABEL_WIDTH + pw),
          y1: String(top + LANE_HEIGHT + LANE_GAP / 2),
          y2: String(top + LANE_HEIGHT + LANE_GAP / 2),
          class: 'browser__lane-rule',
        }),
      );
    });

    overlay.append(
      drawGenes(
        annotations,
        view,
        pw,
        AXIS_HEIGHT + data.length * (LANE_HEIGHT + LANE_GAP),
      ),
    );

    // Marca de la variante, si cae en la ventana.
    if (variant) {
      const scale = makeScale(view, pw);
      const x = scale.toPixel(variant.position);
      if (x >= LABEL_WIDTH && x <= LABEL_WIDTH + pw) {
        overlay.append(
          svg('line', {
            x1: String(x),
            x2: String(x),
            y1: String(AXIS_HEIGHT),
            y2: String(height - GENE_LANE_HEIGHT),
            class: 'browser__variant-mark',
          }),
          svg('text', {
            x: String(x + 4),
            y: String(AXIS_HEIGHT + 11),
            class: 'browser__variant-label',
            text: `${variant.ref}>${variant.alt}`,
          }),
        );
      }
    }

    urlState?.publish({
      tracks: [...selected],
      start: view.start,
      end: view.end,
    });

    const level = data[0]?.level ?? 'overview';
    const span = view.end - view.start;
    // Si el usuario se acerco lo suficiente pero el bloque de 1 pb no cubre
    // esta ventana, hay que decirlo: quedarse callado parece un fallo.
    const detailOutOfRange =
      !!detail &&
      level === 'overview' &&
      span <= DETAIL_THRESHOLD_BP &&
      (view.end <= detail.interval.start || view.start >= detail.interval.end);

    status.textContent =
      `${fmt.intervalLabel(locus.interval.chromosome, view.start, view.end)} · ` +
      `${fmt.span(span)} · ` +
      `resolucion ${level === 'detail' ? '1 pb' : `${overview.binSize} pb por bin`}` +
      (lastFrameMs ? ` · ${lastFrameMs.toFixed(1)} ms por frame` : '') +
      (data.length ? '' : ' · elige al menos una modalidad') +
      (detailOutOfRange
        ? ` · el bloque de 1 pb solo cubre ${fmt.intervalLabel(
            detail!.interval.chromosome,
            detail!.interval.start,
            detail!.interval.end,
          )}`
        : '');
  }

  // ---- Interaccion --------------------------------------------------------

  function clampView(next: Viewport): Viewport {
    let { start, end } = next;
    const span = Math.max(MIN_SPAN_BP, Math.min(full.end - full.start, end - start));
    const center = (start + end) / 2;
    start = Math.round(center - span / 2);
    end = start + Math.round(span);
    if (start < full.start) {
      start = full.start;
      end = start + Math.round(span);
    }
    if (end > full.end) {
      end = full.end;
      start = end - Math.round(span);
    }
    return { start, end };
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const pw = plotWidth();
    const scale = makeScale(view, pw);
    const anchorBp = scale.toBp(event.clientX - rect.left);
    const factor = Math.exp(event.deltaY * 0.0012);
    const span = (view.end - view.start) * factor;
    // El zoom se ancla al cursor: el punto bajo el puntero no se mueve.
    const fraction = (anchorBp - view.start) / (view.end - view.start);
    const before = view;
    view = clampView({
      start: anchorBp - fraction * span,
      end: anchorBp + (1 - fraction) * span,
    });

    // Escalado inmediato del bitmap para que el gesto responda en el frame,
    // y redibujado de verdad cuando la rueda se detiene.
    const ratio = (before.end - before.start) / (view.end - view.start);
    gestureScale *= ratio;
    const anchorPx = scale.toPixel(anchorBp) - LABEL_WIDTH;
    gestureShift = (gestureShift - anchorPx) * ratio + anchorPx;
    applyGestureTransform();
    settle();
  }

  let dragging = false;
  let dragStartX = 0;
  let dragStartView: Viewport = { ...view };

  function onPointerDown(event: PointerEvent): void {
    dragging = true;
    dragStartX = event.clientX;
    dragStartView = { ...view };
    window.clearTimeout(settleTimer);
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-dragging');
  }

  function onPointerMove(event: PointerEvent): void {
    const rect = stage.getBoundingClientRect();
    const pw = plotWidth();

    if (dragging) {
      const span = dragStartView.end - dragStartView.start;
      const deltaBp = ((dragStartX - event.clientX) / pw) * span;
      const previous = view.start;
      view = clampView({
        start: dragStartView.start + deltaBp,
        end: dragStartView.end + deltaBp,
      });
      // Lo que de verdad se movio puede ser menos de lo arrastrado si la vista
      // topo con el borde del locus; el desplazamiento visual sigue a eso, no
      // al raton, para que el tope se vea.
      const movedBp = view.start - previous;
      gestureShift -= (movedBp / span) * pw;
      applyGestureTransform();
      return;
    }

    // Crosshair y lectura de valores bajo el cursor.
    const x = event.clientX - rect.left;
    if (x < LABEL_WIDTH) {
      tip.hide();
      return;
    }
    const scale = makeScale(view, pw);
    const bp = Math.round(scale.toBp(x));
    const data = lanes();
    if (!data.length) return;

    const rows = data.slice(0, 6).map((lane) => {
      const index = Math.max(
        0,
        Math.min(lane.ref.length - 1, Math.floor((bp - lane.origin) / lane.binSize)),
      );
      const r = lane.ref[index]!;
      const a = lane.alt[index]!;
      return {
        label: `${lane.track.header.biosample ?? lane.modality}`,
        value: `${fmt.fixed2(r)} → ${fmt.fixed2(a)}  (${fmt.signed2(a - r)})`,
        swatch: modalityColor(lane.modality),
      };
    });

    tip.show(
      fmt.coordinate(locus.interval.chromosome, bp),
      [{ label: 'REF → ALT (diferencia)', value: '', emphasis: true }, ...rows],
      event.clientX,
      event.clientY,
    );
  }

  function onPointerUp(event: PointerEvent): void {
    if (dragging) settle();
    dragging = false;
    try {
      stage.releasePointerCapture(event.pointerId);
    } catch {
      // El puntero pudo salirse de la ventana; no es un error.
    }
    stage.classList.remove('is-dragging');
  }

  function onKeyDown(event: KeyboardEvent): void {
    const span = view.end - view.start;
    const step = span * 0.2;
    if (event.key === 'ArrowRight') {
      view = clampView({ start: view.start + step, end: view.end + step });
    } else if (event.key === 'ArrowLeft') {
      view = clampView({ start: view.start - step, end: view.end - step });
    } else if (event.key === '+' || event.key === '=') {
      view = clampView({ start: view.start + span * 0.15, end: view.end - span * 0.15 });
    } else if (event.key === '-') {
      view = clampView({ start: view.start - span * 0.2, end: view.end + span * 0.2 });
    } else if (event.key === '0') {
      view = { ...full };
    } else {
      return;
    }
    event.preventDefault();
    void ensureBlocks().then(scheduleDraw);
  }

  // ---- Carga --------------------------------------------------------------

  async function ensureBlocks(): Promise<void> {
    const span = view.end - view.start;
    const wantDetail =
      !!detail &&
      span <= DETAIL_THRESHOLD_BP &&
      view.start < detail.interval.end &&
      view.end > detail.interval.start;

    const jobs: Promise<void>[] = [];
    for (const modality of selected) {
      const overviewRef = overview.modalities[modality];
      if (overviewRef && !blocks.has(`overview:${modality}`)) {
        jobs.push(
          loadSignal(locusPath, overviewRef.path).then((block) => {
            blocks.set(`overview:${modality}`, block);
          }),
        );
      }
      const detailRef = detail?.modalities[modality];
      if (wantDetail && detailRef && !blocks.has(`detail:${modality}`)) {
        jobs.push(
          loadSignal(locusPath, detailRef.path).then((block) => {
            blocks.set(`detail:${modality}`, block);
          }),
        );
      }
    }
    if (!jobs.length) return;
    await Promise.all(jobs);
  }

  function buildChips(): void {
    clear(chips);
    for (const modality of available) {
      const ref = overview.modalities[modality]!;
      const active = selected.has(modality);
      const chip = el('button', {
        class: active ? 'chip chip--on' : 'chip',
        type: 'button',
        'aria-pressed': String(active),
        title: `${ref.tracks} tracks · ${fmt.bytes(ref.bytes)}`,
      });
      chip.append(
        el('span', {
          class: 'chip__swatch',
          style: `background:${modalityColor(modality)}`,
          'aria-hidden': 'true',
        }),
        document.createTextNode(modality.replace(/_/g, ' ').toLowerCase()),
      );
      chip.addEventListener('click', () => {
        if (selected.has(modality)) selected.delete(modality);
        else selected.add(modality);
        buildChips();
        status.textContent = 'Cargando senal...';
        void ensureBlocks().then(scheduleDraw);
      });
      chips.append(chip);
    }
    if (detail) {
      const jump = el('button', {
        class: 'chip chip--action',
        type: 'button',
        text: 'Ir a la variante (1 pb)',
        title: `Salta a ${fmt.intervalLabel(
          detail.interval.chromosome,
          detail.interval.start,
          detail.interval.end,
        )}, la ventana que el bloque de 1 pb cubre.`,
      });
      jump.addEventListener('click', () => {
        view = clampView({ start: detail.interval.start, end: detail.interval.end });
        status.textContent = 'Cargando senal...';
        void ensureBlocks().then(scheduleDraw);
      });
      chips.append(jump);
    }

    const reset = el('button', {
      class: 'chip chip--action',
      type: 'button',
      text: 'Ver locus completo',
    });
    reset.addEventListener('click', () => {
      view = { ...full };
      void ensureBlocks().then(scheduleDraw);
    });
    chips.append(reset);
  }

  // ---- Montaje ------------------------------------------------------------

  buildChips();
  container.append(
    provenanceStrip(locus.provenance),
    panel(
      {
        title: 'Navegador de tracks',
        subtitle: 'Senal predicha REF contra ALT a lo largo del locus',
        // La marca de origen viaja con el panel porque esta vista no tiene
        // titulo propio: el sello del pie queda a 900 px de scroll.
        actions: [sourceChip(locus.provenance)],
        hint:
          'La linea gris es REF y la de color es ALT. El area sombreada entre ' +
          'las dos es la diferencia: naranja donde la variante sube la senal, ' +
          'azul donde la baja. Rueda para acercar, arrastra para desplazar, ' +
          'tecla 0 para volver al locus completo. Al bajar de 8 kb de ventana ' +
          'cambia solo a resolucion de 1 pb.',
      },
      el('div', {}, chips, body),
    ),
    predictionNotice(),
  );

  stage.tabIndex = 0;
  stage.setAttribute('role', 'application');
  stage.setAttribute(
    'aria-label',
    'Navegador de tracks. Flechas para desplazar, mas y menos para el zoom, cero para el locus completo.',
  );
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointerleave', () => tip.hide());
  stage.addEventListener('keydown', onKeyDown);

  const stopResize = onResize(body, (w) => {
    width = w;
    scheduleDraw();
  });
  const stopTheme = onThemeChange(scheduleDraw);

  status.textContent = 'Cargando senal...';
  void (async () => {
    try {
      if (locus.annotations) {
        annotations = await loadAnnotations(locusPath, locus.annotations);
      }
    } catch {
      // La anotacion es complementaria: sin ella la senal sigue siendo util,
      // y el carril lo dice en vez de quedarse en blanco.
      annotations = null;
    }
    try {
      await ensureBlocks();
      if (!disposed) draw();
    } catch (error) {
      clear(body);
      body.append(
        errorState(
          'No se pudo cargar la senal',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  })();

  return () => {
    disposed = true;
    window.clearTimeout(settleTimer);
    stopResize();
    stopTheme();
    tip.hide();
  };
}

/** Estado de carga mientras llega el primer bloque. */
export function trackBrowserPlaceholder(bytes?: number): HTMLElement {
  return loadingState('el navegador de tracks', bytes);
}
