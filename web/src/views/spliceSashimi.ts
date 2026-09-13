/**
 * V4 — Sashimi de splicing, REF contra ALT.
 *
 * Arcos ESPEJADOS sobre un eje compartido: REF arriba, ALT abajo, nunca
 * superpuestos. Superponerlos los vuelve sopa; la asimetria entre las dos
 * mitades es la senal y tiene que leerse de un vistazo, sin que nadie calcule
 * una resta primero. Para quien quiere la magnitud exacta existe el modo "solo
 * delta", que sustituye las dos mitades por una sola fila de arcos con signo.
 *
 * Por que el grosor es logaritmico
 * ---------------------------------
 * Los conteos de uniones abarcan ordenes de magnitud (medido: p50 = 0,0001,
 * p99 = 0,0207 sobre las 5553 uniones de la ventana de DNM1). Un grosor lineal
 * dejaria practicamente todo en un hilo y una sola union dominando el dibujo.
 * El grosor se mapea a un rango acotado (piso ~1px, techo ~8px) sobre el
 * dominio [minValueShown, maximo observado]; un valor por debajo del piso no
 * se dibuja -es la misma idea que "modalidad silenciosa": ausencia real, no
 * un cero que se perdio en el redondeo.
 */

import { clear, el, onResize, onThemeChange, svg, token } from '../lib/dom';
import * as fmt from '../lib/format';
import { divergingScale } from '../lib/color';
import { emptyState, panel, predictionNotice, provenanceStrip, sourceChip, tooltip } from '../lib/ui';
import type { SpliceDoc, SpliceJunction } from '../lib/types';

const MARGIN = { top: 28, right: 16, bottom: 30, left: 16 };
const LANE_HEIGHT = 130;
const MIN_ARC_HEIGHT = 22;
const MIN_WIDTH_PX = 1;
const MAX_WIDTH_PX = 8;
/**
 * Cuantos arcos, como maximo, llevan su DELTA escrito directamente encima.
 *
 * Se ordena por |ALT - REF|, nunca por magnitud. En un visor de efecto de
 * variante el nivel no es la noticia: los tres arcos mas gruesos de DNM1 son
 * constitutivos y se mueven 0,01 entre REF y ALT, mientras que la senal real
 * vive en cuatro uniones que el orden por magnitud dejaba sin etiquetar.
 */
const DELTA_LABEL_COUNT = 4;

/**
 * Media ventana, en pares de bases, para decidir que un arco TOCA la variante.
 *
 * Calibrado contra el artefacto, no razonado: en DNM1 los extremos de union
 * caen a 2 y 8 pb de la variante y el siguiente esta a 43, asi que cualquier
 * valor entre 10 y 40 separa igual. 20 pb es ademas el orden del tracto de
 * pirimidinas que define un sitio aceptor, que es lo que aqui se mueve.
 */
const VARIANT_FOOTPRINT_BP = 20;

const REF_COLOR_TOKEN = '--div-neg-2';
const ALT_COLOR_TOKEN = '--div-pos-2';

function widthFor(value: number, domainMin: number, domainMax: number): number {
  if (!(value >= domainMin)) return 0;
  if (domainMax <= domainMin) return MAX_WIDTH_PX;
  const t = (Math.log(value) - Math.log(domainMin)) / (Math.log(domainMax) - Math.log(domainMin));
  return MIN_WIDTH_PX + Math.max(0, Math.min(1, t)) * (MAX_WIDTH_PX - MIN_WIDTH_PX);
}

/** Altura del arco: mas ancho el intervalo, mas alto el pico, con techo. */
function arcHeight(spanPx: number, plotWidth: number): number {
  const fraction = Math.max(0, Math.min(1, spanPx / Math.max(1, plotWidth)));
  return MIN_ARC_HEIGHT + (LANE_HEIGHT - MIN_ARC_HEIGHT) * Math.sqrt(fraction);
}

/**
 * Un extremo de la union cae dentro de la huella de la variante.
 *
 * `position` viene 1-based del contrato; las coordenadas de union son 0-based.
 */
export function touchesVariant(j: SpliceJunction, position: number): boolean {
  const p = position - 1;
  return (
    Math.abs(j.start - p) <= VARIANT_FOOTPRINT_BP ||
    Math.abs(j.end - p) <= VARIANT_FOOTPRINT_BP
  );
}

/** Ordena por |ALT - REF| y descarta lo que no supera el piso de ruido. */
function byDelta(junctions: readonly SpliceJunction[], floor: number): SpliceJunction[] {
  return junctions
    .filter((j) => Math.abs(j.alt - j.ref) >= floor)
    .slice()
    .sort((a, b) => Math.abs(b.alt - b.ref) - Math.abs(a.alt - a.ref));
}

function arcPath(x0: number, x1: number, baseline: number, height: number, dir: 1 | -1): string {
  const mid = (x0 + x1) / 2;
  const peak = baseline + dir * height;
  return `M ${x0} ${baseline} Q ${mid} ${peak} ${x1} ${baseline}`;
}

export function renderSpliceSashimi(container: HTMLElement, doc: SpliceDoc): () => void {
  const biosampleChip = el('span', {
    class: 'card__chip',
    title: `Ontologia ${doc.biosample.ontologyCurie}`,
    text: doc.biosample.name,
  });

  if (doc.status === 'no_data') {
    container.append(
      provenanceStrip(doc.provenance),
      panel(
        {
          title: 'Splicing (sashimi)',
          subtitle: 'Uniones de empalme, REF contra ALT',
          actions: [sourceChip(doc.provenance), biosampleChip],
        },
        emptyState(
          'Sin uniones de empalme en esta ventana.',
          'El scorer SPLICE_JUNCTIONS no devolvio observaciones para este ' +
            'biosample en este intervalo. Modalidad silenciosa, no un fallo: ' +
            'el mismo patron que "sin rsid catalogado".',
        ),
      ),
    );
    return () => {};
  }

  const junctions = doc.junctions;
  const magnitudes = junctions.flatMap((j) => [j.ref, j.alt]).filter((v) => v > 0);
  const domainMin = doc.minValueShown;
  const domainMax = Math.max(domainMin, ...magnitudes, 0.000001);

  let width = 900;
  let deltaMode = false;
  const tip = tooltip();

  const svgRoot = svg('svg', { class: 'sashimi__plot' });
  const stage = el('div', { class: 'sashimi__stage' }, svgRoot as unknown as HTMLElement);

  const toggle = el(
    'button',
    { class: 'button button--quiet', type: 'button', 'aria-pressed': 'false' },
    'Solo delta',
  );
  toggle.addEventListener('click', () => {
    deltaMode = !deltaMode;
    toggle.setAttribute('aria-pressed', String(deltaMode));
    draw();
  });

  const readout = el('p', { class: 'sashimi__readout' });
  readout.textContent =
    `${junctions.length} de ${doc.totalJunctionsInWindow} uniones en esta ventana, ` +
    `mostrando solo las que superan ${fmt.fixed2(doc.minValueShown)}`;

  function plotWidth(): number {
    return Math.max(200, width - MARGIN.left - MARGIN.right);
  }

  function height(): number {
    return MARGIN.top + LANE_HEIGHT * (deltaMode ? 1 : 2) + MARGIN.bottom;
  }

  function xFor(position: number): number {
    const span = doc.interval.end - doc.interval.start;
    return MARGIN.left + ((position - doc.interval.start) / span) * plotWidth();
  }

  function draw(): void {
    const h = height();
    svgRoot.setAttribute('width', String(width));
    svgRoot.setAttribute('height', String(h));
    svgRoot.setAttribute('viewBox', `0 0 ${width} ${h}`);
    clear(svgRoot as unknown as Element);

    const rule = token('--rule');
    const refColor = token(REF_COLOR_TOKEN);
    const altColor = token(ALT_COLOR_TOKEN);
    const pw = plotWidth();

    // Resalte de los arcos que tocan la variante. Solo se atenua el resto si
    // hay al menos uno que tocar: atenuar la vista entera cuando no hay nada
    // que resaltar seria decir "mira aqui" senalando a ningun sitio.
    const touching = junctions.filter((j) => touchesVariant(j, doc.variant.position));
    const anyTouching = touching.length > 0;
    // Los que tocan se dibujan al final para que queden por encima.
    const drawOrder = anyTouching
      ? [...junctions.filter((j) => !touchesVariant(j, doc.variant.position)), ...touching]
      : junctions;
    const arcClass = (j: SpliceJunction): string => {
      if (!anyTouching) return 'sashimi__arc';
      return touchesVariant(j, doc.variant.position)
        ? 'sashimi__arc sashimi__arc--touching'
        : 'sashimi__arc sashimi__arc--muted';
    };

    // Dos uniones que comparten donador y cuyos aceptores distan 6 pb son, a
    // esta escala, el MISMO arco: mismo punto medio, misma altura. Sus dos
    // etiquetas caian encima la una de la otra y el resultado se leia como un
    // numero inventado ("1,43" sobre "0,03" parecia "0,09"). Es justo el par
    // que forma la senal, asi que no es un caso raro: es el caso.
    const placed: { x: number; y: number }[] = [];
    function placeLabel(x: number, y: number, dir: 1 | -1, text: string): void {
      let fy = y;
      for (let guard = 0; guard < 8; guard++) {
        const clash = placed.some((q) => Math.abs(q.x - x) < 26 && Math.abs(q.y - fy) < 11);
        if (!clash) break;
        fy += dir * 12;
      }
      placed.push({ x, y: fy });
      svgRoot.append(
        svg('text', {
          x: String(x),
          y: String(fy),
          class: 'sashimi__label',
          'text-anchor': 'middle',
          text,
        }),
      );
    }

    if (deltaMode) {
      const baseline = MARGIN.top + LANE_HEIGHT;
      svgRoot.append(
        svg('line', {
          x1: String(MARGIN.left),
          x2: String(MARGIN.left + pw),
          y1: String(baseline),
          y2: String(baseline),
          class: 'sashimi__baseline',
        }),
      );
      const maxAbsDelta = Math.max(0.000001, ...junctions.map((j) => Math.abs(j.alt - j.ref)));
      const deltaScale = divergingScale(maxAbsDelta);
      const labeled = new Set(
        byDelta(junctions, doc.minValueShown).slice(0, DELTA_LABEL_COUNT),
      );

      for (const j of drawOrder) {
        const delta = j.alt - j.ref;
        const x0 = xFor(j.start);
        const x1 = xFor(j.end);
        const h2 = arcHeight(x1 - x0, pw);
        const dir: 1 | -1 = delta >= 0 ? -1 : 1;
        const strokeWidth = widthFor(Math.abs(delta), domainMin, domainMax);
        if (strokeWidth <= 0) continue;
        const path = svg('path', {
          d: arcPath(x0, x1, baseline, h2, dir),
          class: arcClass(j),
          fill: 'none',
          stroke: deltaScale(delta),
          'stroke-width': String(strokeWidth),
        });
        path.addEventListener('mouseenter', (event) => showTip(event as MouseEvent, j, delta));
        path.addEventListener('mouseleave', () => tip.hide());
        svgRoot.append(path);
        if (labeled.has(j)) {
          placeLabel((x0 + x1) / 2, baseline + dir * h2 + dir * -6, dir, fmt.signed2(delta));
        }
      }
    } else {
      const baseline = MARGIN.top + LANE_HEIGHT;
      svgRoot.append(
        svg('line', {
          x1: String(MARGIN.left),
          x2: String(MARGIN.left + pw),
          y1: String(baseline),
          y2: String(baseline),
          class: 'sashimi__baseline',
        }),
      );

      // Se etiqueta por DELTA, con un piso que impide que una etiqueta apunte a
      // ruido. El arco mas grueso conserva UNA etiqueta como referencia de
      // escala: sin ella los deltas no tienen contra que leerse.
      const labeled = new Set(byDelta(junctions, doc.minValueShown).slice(0, DELTA_LABEL_COUNT));
      // La mayor de las que se ven ENTERAS, no la mayor a secas: las uniones
      // que entran en la ventana por un extremo tienen el punto medio fuera
      // del lienzo, y su etiqueta se dibujaba en x = -60, invisible. Una
      // referencia de escala que no se ve no es una referencia de escala.
      const scaleRef = [...junctions]
        .filter((j) => {
          const mid = (xFor(j.start) + xFor(j.end)) / 2;
          return mid >= MARGIN.left + 16 && mid <= MARGIN.left + pw - 16;
        })
        .sort((a, b) => Math.max(b.ref, b.alt) - Math.max(a.ref, a.alt))[0];
      // Deduplicado: si el arco mayor ya se gano su etiqueta por delta, no se
      // repite. No pasa en DNM1, pasara en alguna variante.
      const scaleRefSide: 'ref' | 'alt' | null =
        scaleRef && !labeled.has(scaleRef) ? (scaleRef.alt > scaleRef.ref ? 'alt' : 'ref') : null;

      for (const side of ['ref', 'alt'] as const) {
        const dir: 1 | -1 = side === 'ref' ? -1 : 1;
        const color = side === 'ref' ? refColor : altColor;
        for (const j of drawOrder) {
          const value = j[side];
          const strokeWidth = widthFor(value, domainMin, domainMax);
          if (strokeWidth <= 0) continue;
          const x0 = xFor(j.start);
          const x1 = xFor(j.end);
          const h2 = arcHeight(x1 - x0, pw);
          const path = svg('path', {
            d: arcPath(x0, x1, baseline, h2, dir),
            class: arcClass(j),
            fill: 'none',
            stroke: color,
            'stroke-width': String(strokeWidth),
          });
          path.addEventListener('mouseenter', (event) => showTip(event as MouseEvent, j));
          path.addEventListener('mouseleave', () => tip.hide());
          svgRoot.append(path);
          const isScaleRef = j === scaleRef && side === scaleRefSide;
          if ((labeled.has(j) || isScaleRef) && value >= domainMin) {
            placeLabel((x0 + x1) / 2, baseline + dir * h2 + dir * -6, dir, fmt.residual(value));
          }
        }
      }

      svgRoot.append(
        svg('text', {
          x: String(MARGIN.left),
          y: String(MARGIN.top - 10),
          class: 'sashimi__lane-label',
          fill: refColor,
          text: 'REF',
        }),
        svg('text', {
          x: String(MARGIN.left),
          y: String(h - MARGIN.bottom + 16),
          class: 'sashimi__lane-label',
          fill: altColor,
          text: 'ALT',
        }),
      );
    }

    // Marca de la variante.
    const vx = xFor(doc.variant.position - 1);
    svgRoot.append(
      svg('line', {
        x1: String(vx),
        x2: String(vx),
        y1: String(MARGIN.top - 4),
        y2: String(h - MARGIN.bottom + 4),
        class: 'sashimi__variant-mark',
      }),
      svg('text', {
        x: String(vx),
        y: String(h - MARGIN.bottom + 24),
        class: 'sashimi__tick-label',
        'text-anchor': 'middle',
        text: fmt.coordinate(doc.variant.chromosome, doc.variant.position),
      }),
    );

    // Eje.
    for (const value of fmt.niceTicks(
      doc.interval.start,
      doc.interval.end,
      Math.max(2, Math.floor(pw / 140)),
    )) {
      const x = xFor(value);
      if (x < MARGIN.left || x > MARGIN.left + pw) continue;
      svgRoot.append(
        svg('line', {
          x1: String(x),
          x2: String(x),
          y1: String(h - MARGIN.bottom),
          y2: String(h - MARGIN.bottom + 4),
          stroke: rule,
        }),
        svg('text', {
          x: String(x),
          y: String(h - MARGIN.bottom - 6),
          class: 'sashimi__tick-label',
          'text-anchor': 'middle',
          text: fmt.int(Math.round(value)),
        }),
      );
    }
  }

  function showTip(event: MouseEvent, j: SpliceJunction, delta?: number): void {
    const title = `${fmt.coordinate(doc.interval.chromosome, j.start + 1)} - ${j.end - j.start} pb`;
    if (delta !== undefined) {
      tip.show(
        title,
        [
          { label: 'REF', value: fmt.fixed2(j.ref) },
          { label: 'ALT', value: fmt.fixed2(j.alt) },
          { label: 'ALT - REF', value: fmt.signed2(delta), emphasis: true },
        ],
        event.clientX,
        event.clientY,
      );
      return;
    }
    tip.show(
      title,
      [
        { label: 'REF', value: fmt.fixed2(j.ref), swatch: token(REF_COLOR_TOKEN), emphasis: true },
        { label: 'ALT', value: fmt.fixed2(j.alt), swatch: token(ALT_COLOR_TOKEN), emphasis: true },
      ],
      event.clientX,
      event.clientY,
    );
  }

  container.append(
    provenanceStrip(doc.provenance),
    panel(
      {
        title: 'Splicing (sashimi)',
        subtitle: `Uniones de empalme, REF contra ALT · ${doc.biosample.name}`,
        actions: [sourceChip(doc.provenance), biosampleChip, toggle],
        hint: deltaHint(),
      },
      el(
        'div',
        {},
        ...findingBlock(doc),
        readout,
        stage,
        widthLegend(domainMin, domainMax),
      ),
    ),
    predictionNotice(),
  );

  function deltaHint(): string {
    const touching = junctions.filter((j) => touchesVariant(j, doc.variant.position)).length;
    return (
      'REF arriba del eje, ALT abajo: la diferencia de forma entre las dos mitades ' +
      'es la senal. "Solo delta" cambia a una sola fila con el signo de ALT menos ' +
      'REF -rojo cuando ALT gana, azul cuando REF gana- para quien quiere la ' +
      'magnitud exacta en vez de comparar dos siluetas.' +
      (touching
        ? ` Los ${touching} arcos que tocan la posicion de la variante van a ` +
          `plena intensidad y el resto atenuado; las etiquetas se reparten por ` +
          `|ALT - REF|, no por grosor, mas una sola sobre el arco mayor como ` +
          `referencia de escala.`
        : '')
    );
  }

  const stopResize = onResize(stage, (w) => {
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

/**
 * El hallazgo: la afirmacion redactada, y debajo las cifras que la sostienen.
 *
 * El reparto no es cosmetico. El texto viene del artefacto y NO lleva numeros;
 * los numeros se leen aqui de `doc.junctions`. Asi la frase no puede quedarse
 * vieja cuando el artefacto se regenere: si la biologia cambiara, la tabla lo
 * ensenaria en la misma pantalla, y ademas un test del pipeline compara la
 * afirmacion contra las uniones reales y rompe la build antes de llegar aqui.
 */
function findingBlock(doc: SpliceDoc): HTMLElement[] {
  if (!doc.finding) return [];
  const touching = doc.junctions
    .filter((j) => touchesVariant(j, doc.variant.position))
    .sort((a, b) => Math.abs(b.alt - b.ref) - Math.abs(a.alt - a.ref));
  if (!touching.length) return [];

  const rows = touching.map((j) => {
    const delta = j.alt - j.ref;
    return el(
      'tr',
      {},
      el('th', { scope: 'row', text: `${fmt.int(j.start + 1)} → ${fmt.int(j.end)}` }),
      el('td', { text: fmt.residual(j.ref) }),
      el('td', { text: fmt.residual(j.alt) }),
      el('td', {
        class: 'finding__delta',
        style: `color: ${delta >= 0 ? token(ALT_COLOR_TOKEN) : token(REF_COLOR_TOKEN)}`,
        text: fmt.signed2(delta),
      }),
    );
  });

  return [
    el(
      'section',
      { class: 'finding' },
      el('h3', { class: 'finding__title', text: 'El hallazgo' }),
      el('p', { class: 'finding__text', text: doc.finding }),
      el(
        'table',
        { class: 'finding__table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { scope: 'col', text: 'Donador → aceptor' }),
            el('th', { scope: 'col', text: 'REF' }),
            el('th', { scope: 'col', text: 'ALT' }),
            el('th', { scope: 'col', text: 'ALT − REF' }),
          ),
        ),
        el('tbody', {}, ...rows),
      ),
      el('p', {
        class: 'finding__method',
        text:
          `Las cifras salen del propio artefacto: son las ${touching.length} uniones ` +
          `cuyos extremos caen a ${VARIANT_FOOTPRINT_BP} pb o menos de ` +
          `${fmt.coordinate(doc.variant.chromosome, doc.variant.position)}, entre las ` +
          `${doc.junctions.length} que superan el piso de ${fmt.fixed2(doc.minValueShown)} ` +
          `en esta ventana. Son tambien las ${touching.length} primeras al ordenar por |ALT - REF|.`,
      }),
    ),
  ];
}

/** Leyenda del grosor: que valor representa el piso y que valor el techo. */
function widthLegend(domainMin: number, domainMax: number): HTMLElement {
  const rule = token('--rule');
  const samples = [domainMin, Math.sqrt(domainMin * domainMax), domainMax];
  const root = svg('svg', {
    class: 'legend',
    width: '260',
    height: '40',
    viewBox: '0 0 260 40',
    role: 'img',
    'aria-label': 'Leyenda de grosor: escala logaritmica de magnitud de union.',
  });
  root.append(svg('text', { x: '0', y: '10', class: 'legend__title', text: 'Grosor · magnitud (log)' }));
  let x = 4;
  for (const value of samples) {
    const w = widthFor(value, domainMin, domainMax);
    root.append(
      svg('line', {
        x1: String(x),
        x2: String(x + 34),
        y1: '26',
        y2: '26',
        stroke: rule,
        'stroke-width': String(Math.max(1, w)),
      }),
      svg('text', { x: String(x), y: '38', class: 'legend__label', text: fmt.fixed2(value) }),
    );
    x += 80;
  }
  return el('div', { class: 'sashimi__legend' }, root as unknown as HTMLElement);
}
