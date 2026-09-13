/**
 * V5 — Diff de mapa de contacto, ALT menos REF.
 *
 * La trampa de esta vista, y por que el dominio es fijo
 * -----------------------------------------------------
 * A 2048 pb por bin, una sola variante casi nunca mueve la estructura 3D. Si
 * el color se escalara al rango del propio diff, un cambio de milesimas
 * pintaria un patron dramatico y NINGUN test fallaria: el mapa se veria igual
 * de espectacular con senal que con ruido. Por eso el dominio viene del
 * artefacto, es una constante del pipeline, y esta vista no lo recalcula
 * jamas.
 *
 * La prueba que separa un dominio fijo de un autoescalado disfrazado es si
 * cambia cuando cambian los datos. Un "redondo por encima del grueso" tambien
 * es autoescalado, solo que con un paso de redondeo encima.
 *
 * Como el resultado esperado es "casi plano", el peso informativo se reparte
 * para que el mapa nunca sea la unica fuente:
 *   - la leyenda MARCA donde cae el maximo observado dentro del dominio fijo,
 *     asi que la pequenez se ve, no solo se lee;
 *   - el texto la dice con cifras, incluida la comparacion contra el relieve
 *     que la estructura ya tiene;
 *   - la magnificacion existe, pero es un boton con su factor en la etiqueta,
 *     y solo despues de que el estado por defecto haya dicho la verdad.
 *
 * Los dos triangulos
 * ------------------
 * El mapa es simetrico -se comprueba al congelar-, asi que la mitad de abajo
 * seria una copia de la de arriba. En vez de desperdiciarla, arriba va la
 * ESTRUCTURA (REF) y abajo el CAMBIO. El contraste entre las dos mitades del
 * mismo cuadrado es el argumento entero: un relieve de dominios evidente
 * arriba, nada abajo.
 *
 * La cruz
 * -------
 * La fila y la columna del bin de la variante son, literalmente, lo que midio
 * el feature de mapas de contacto del AVI: "all interactions involving the
 * variant-containing bin". Resaltarlas hace que el enlace desde la cascada
 * SHAP aterrice en las celdas que produjeron el numero. Como la matriz es
 * simetrica, fila y columna son el mismo conjunto contado dos veces.
 */

import { clear, el, onResize, onThemeChange, setupCanvas, token } from '../lib/dom';
import * as fmt from '../lib/format';
import { divergingScale } from '../lib/color';
import { panel, predictionNotice, provenanceStrip, sourceChip, tooltip } from '../lib/ui';
import type { TooltipRow } from '../lib/ui';
import type { ContactsDoc } from '../lib/types';

/** Factor de la lupa. Etiquetado en el boton y en la leyenda; nunca implicito. */
const MAGNIFY = 20;

const MARGIN = { top: 10, right: 10, bottom: 10, left: 10 };
const MAX_SIDE = 520;

interface Cell {
  i: number;
  j: number;
}

/**
 * Indice dentro del triangulo superior guardado por filas.
 *
 * El artefacto guarda solo media matriz porque la simetria se comprueba al
 * congelar. Si este calculo estuviera mal, la vista dibujaria la transpuesta
 * y nadie lo notaria: un mapa simetrico se ve igual del reves. Por eso hay un
 * test del lado del pipeline que reconstruye la matriz entera y la compara.
 */
function triIndex(n: number, i: number, j: number): number {
  const [a, b] = i <= j ? [i, j] : [j, i];
  return (a * (2 * n - a + 1)) / 2 + (b - a);
}

export function renderContactDiff(container: HTMLElement, doc: ContactsDoc): () => void {
  const canvas = el('canvas', { class: 'contacts__canvas' });
  const readout = el('p', { class: 'contacts__readout' });
  const stage = el('div', { class: 'contacts__stage' }, canvas);
  const tip = tooltip();

  const n = doc.bins ?? 0;
  const domain = doc.domain ?? 1;
  const deltaScale = doc.scales?.delta ?? 1;
  const refScale = doc.scales?.reference ?? 1;
  const delta = doc.delta ?? [];
  const reference = doc.reference ?? [];
  const vbin = doc.variantBin ?? -1;
  const maxAbs = doc.maxAbsDelta ?? 0;
  const threshold = doc.visibleThreshold ?? 0;
  const range = doc.referenceRange;

  /** Dominio simetrico del triangulo de estructura. Este SI sale de los datos
   * -es el relieve que hay, no una medida de efecto- y por eso se etiqueta
   * como lo que es y no comparte leyenda con el diff. */
  const refDomain = range ? Math.max(Math.abs(range.min), Math.abs(range.max)) : 1;

  let magnified = false;
  let width = 900;
  let hover: Cell | null = null;

  function deltaAt(i: number, j: number): number {
    return (delta[triIndex(n, i, j)] ?? 0) * deltaScale;
  }
  function refAt(i: number, j: number): number {
    return (reference[triIndex(n, i, j)] ?? 0) * refScale;
  }
  function activeDomain(): number {
    return magnified ? domain / MAGNIFY : domain;
  }

  function side(): number {
    return Math.min(MAX_SIDE, Math.max(200, width - MARGIN.left - MARGIN.right));
  }

  function cellAt(clientX: number, clientY: number): Cell | null {
    const box = canvas.getBoundingClientRect();
    const s = side();
    const x = clientX - box.left - MARGIN.left;
    const y = clientY - box.top - MARGIN.top;
    if (x < 0 || y < 0 || x >= s || y >= s) return null;
    const j = Math.floor((x / s) * n);
    const i = Math.floor((y / s) * n);
    if (i < 0 || i >= n || j < 0 || j >= n) return null;
    return { i, j };
  }

  function draw(): void {
    const s = side();
    const total = s + MARGIN.top + MARGIN.bottom;
    const ctx = setupCanvas(canvas, s + MARGIN.left + MARGIN.right, total);
    ctx.clearRect(0, 0, s + MARGIN.left + MARGIN.right, total);

    const cell = s / n;
    const deltaColor = divergingScale(activeDomain());
    const refColor = divergingScale(refDomain);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // Arriba la estructura, abajo el cambio. La diagonal va con la
        // estructura: es contacto consigo mismo, no tiene nada que cambiar.
        ctx.fillStyle = j >= i ? refColor(refAt(i, j)) : deltaColor(deltaAt(i, j));
        ctx.fillRect(
          MARGIN.left + j * cell,
          MARGIN.top + i * cell,
          Math.ceil(cell),
          Math.ceil(cell),
        );
      }
    }

    // --- la cruz del AVI --------------------------------------------------
    if (vbin >= 0) {
      ctx.strokeStyle = token('--ink');
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.75;
      ctx.strokeRect(MARGIN.left, MARGIN.top + vbin * cell, s, Math.max(1, cell));
      ctx.strokeRect(MARGIN.left + vbin * cell, MARGIN.top, Math.max(1, cell), s);
      ctx.globalAlpha = 1;
    }

    // --- separador de las dos mitades ------------------------------------
    ctx.strokeStyle = token('--rule');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, MARGIN.top);
    ctx.lineTo(MARGIN.left + s, MARGIN.top + s);
    ctx.stroke();

    if (hover) {
      ctx.strokeStyle = token('--ink');
      ctx.lineWidth = 2;
      ctx.strokeRect(
        MARGIN.left + hover.j * cell,
        MARGIN.top + hover.i * cell,
        Math.max(2, cell),
        Math.max(2, cell),
      );
    }
  }

  /**
   * Leyenda del diff: barra del dominio FIJO con una marca donde cae el maximo
   * observado. La marca es lo que hace visible la pequenez; sin ella, un mapa
   * en blanco y un numero en un parrafo se leen como dos cosas separadas.
   */
  function deltaLegend(): HTMLElement {
    const dom = activeDomain();
    const bar = el('div', { class: 'contacts__bar' });
    const stops = 40;
    const color = divergingScale(dom);
    for (let k = 0; k < stops; k++) {
      const value = -dom + (2 * dom * k) / (stops - 1);
      const chunk = el('span', { class: 'contacts__bar-chunk' });
      chunk.style.background = color(value);
      bar.append(chunk);
    }
    const pct = Math.min(100, (maxAbs / dom) * 100);
    const mark = el('span', { class: 'contacts__mark' });
    // Desde el centro hacia la derecha: la marca senala |maximo|, sin signo.
    mark.style.left = `${50 + pct / 2}%`;
    const markNeg = el('span', { class: 'contacts__mark' });
    markNeg.style.left = `${50 - pct / 2}%`;

    return el(
      'div',
      { class: 'contacts__legend' },
      el(
        'div',
        { class: 'contacts__legend-head' },
        el('span', { class: 'contacts__legend-title' }, 'Cambio (ALT − REF)'),
        el(
          'span',
          { class: 'contacts__legend-note' },
          magnified
            ? `dominio ±${fmt.fixed4(dom)} — magnificado ×${MAGNIFY}`
            : `dominio fijo ±${fmt.fixed2(dom)}`,
        ),
      ),
      el('div', { class: 'contacts__bar-wrap' }, bar, markNeg, mark),
      el(
        'div',
        { class: 'contacts__legend-foot' },
        el('span', {}, `−${fmt.fixed2(dom)}`),
        el(
          'span',
          { class: 'contacts__legend-max' },
          `máximo observado ${fmt.fixed4(maxAbs)}`,
        ),
        el('span', {}, `+${fmt.fixed2(dom)}`),
      ),
    );
  }

  function refLegend(): HTMLElement {
    const bar = el('div', { class: 'contacts__bar' });
    const color = divergingScale(refDomain);
    for (let k = 0; k < 40; k++) {
      const value = -refDomain + (2 * refDomain * k) / 39;
      const chunk = el('span', { class: 'contacts__bar-chunk' });
      chunk.style.background = color(value);
      bar.append(chunk);
    }
    return el(
      'div',
      { class: 'contacts__legend' },
      el(
        'div',
        { class: 'contacts__legend-head' },
        el('span', { class: 'contacts__legend-title' }, 'Estructura (REF)'),
        el(
          'span',
          { class: 'contacts__legend-note' },
          'escala propia: es el relieve que hay, no una medida de efecto',
        ),
      ),
      el('div', { class: 'contacts__bar-wrap' }, bar),
      el(
        'div',
        { class: 'contacts__legend-foot' },
        el('span', {}, fmt.fixed2(-refDomain)),
        el('span', { class: 'contacts__legend-max' }, 'menos contacto ← → más'),
        el('span', {}, fmt.fixed2(refDomain)),
      ),
    );
  }

  /**
   * El estado explicito. Existe para que un mapa casi en blanco no se lea como
   * "fallo la carga": si el maximo no llega al umbral visible, se dice.
   */
  function verdict(): HTMLElement {
    const relief = range ? range.max - range.min : 0;
    const share = relief > 0 ? maxAbs / relief : 0;
    const invisible = maxAbs < threshold;
    return el(
      'div',
      { class: invisible ? 'contacts__verdict is-quiet' : 'contacts__verdict' },
      el(
        'p',
        { class: 'contacts__verdict-lead' },
        invisible
          ? `Cambio máximo en esta ventana: ${fmt.fixed4(maxAbs)}. Por debajo del umbral visible (${fmt.fixed2(threshold)}): el color no puede mostrarlo, y no debe fingir que sí.`
          : `Cambio máximo en esta ventana: ${fmt.fixed4(maxAbs)}, sobre un dominio fijo de ±${fmt.fixed2(domain)}.`,
      ),
      relief > 0
        ? el(
            'p',
            { class: 'contacts__verdict-detail' },
            `La estructura de esta ventana abarca ${fmt.fixed2(relief)} y el mayor cambio es ${fmt.fixed4(maxAbs)}: un ${fmt.percent1(share)} del relieve que ya había. La estructura tridimensional no se mueve.`,
          )
        : el('span', {}),
      doc.maxAbsDeltaAt ? el('p', { class: 'contacts__verdict-detail' }, maxAbsSentence()) : el('span', {}),
    );
  }

  /**
   * Donde cae el maximo. Dos afirmaciones distintas y las dos importan: si
   * toca el bin de la variante -o sea, si esta en la cruz que mide el AVI- y
   * si cae dentro del recorte que se dibuja. La segunda es la que evita la
   * peor version de esta vista: una frase cierta sobre una celda que el
   * lector no puede encontrar en la imagen porque no esta dibujada.
   */
  function maxAbsSentence(): string {
    const at = doc.maxAbsDeltaAt;
    if (!at) return '';
    const where = at.involvesVariantBin
      ? `Ese máximo sí toca el bin de la variante, a ${fmt.span(at.separationBp)} de distancia: ${fmt.fixed4(at.ref)} → ${fmt.fixed4(at.alt)}. Es el mayor cambio de todo el megabase, y aun así es esto.`
      : `Ese máximo ni siquiera toca el bin de la variante: está a ${fmt.span(at.separationBp)} de la diagonal, fuera de la fila que mide el AVI.`;
    if (at.insideDrawnWindow) return where;
    const half = doc.resolution !== undefined && n > 0 ? fmt.span(((n - 1) / 2) * doc.resolution) : 'el recorte';
    return `${where} Queda fuera del recorte que se dibuja (±${half}): se midió sobre el megabase entero, no sobre lo dibujado.`;
  }

  /**
   * Las dos magnitudes, lado a lado. NO son la misma: el feature del AVI es
   * sin signo, diferencia cruda y solo la fila del bin de la variante; esta
   * vista es con signo y sobre la matriz entera. Ensenarlas juntas sin decir
   * en que se diferencian seria invitar a confundirlas.
   */
  function aviBridge(): HTMLElement {
    const rowMean = doc.variantRowMeanAbsDelta;
    if (rowMean === undefined) return el('span', {});
    return el(
      'div',
      { class: 'contacts__bridge' },
      el('h3', { class: 'contacts__bridge-title' }, 'De dónde sale el número del AVI'),
      el(
        'p',
        { class: 'contacts__bridge-text' },
        `El feature de mapas de contacto del AVI mide la media de |ALT − REF| sobre todas las interacciones del bin que contiene la variante. Es la cruz resaltada, extendida al megabase entero: ${fmt.fixed4(rowMean)}. La cruz dibuja la parte de esa fila que cae en el recorte, no la fila completa. Y como la matriz es simétrica, su fila y su columna son el mismo conjunto contado dos veces.`,
      ),
      el(
        'p',
        { class: 'contacts__bridge-text' },
        'Ese número y este mapa no son la misma magnitud, y conviene no confundirlos: el del AVI va sin signo, es una diferencia cruda y solo mira esa cruz. El mapa va con signo y cubre la ventana entera.',
      ),
    );
  }

  function biosampleNote(): HTMLElement {
    return el(
      'p',
      { class: 'contacts__biosample' },
      `Biosample: ${doc.biosample.name} (${doc.biosample.ontologyCurie}). Los mapas de contacto del catálogo son 28 y todos son líneas celulares de 4D Nucleome: no hay tejido primario donde elegir. Una línea hepática es la biología correcta para esta variante, pero sigue siendo una línea celular, no hígado.`,
    );
  }

  function controls(): HTMLElement {
    const button = el(
      'button',
      { class: 'contacts__magnify', type: 'button' },
      `Magnificar ×${MAGNIFY}`,
    );
    const update = () => {
      button.textContent = magnified
        ? `Volver a la escala fija`
        : `Magnificar ×${MAGNIFY}`;
      button.setAttribute('aria-pressed', magnified ? 'true' : 'false');
    };
    update();
    button.addEventListener('click', () => {
      magnified = !magnified;
      update();
      render();
    });
    return el(
      'div',
      { class: 'contacts__controls' },
      button,
      el(
        'span',
        { class: 'contacts__controls-note' },
        magnified
          ? `El dominio está dividido por ${MAGNIFY}. Lo que se ve ahora está magnificado, no es lo que mide la escala comparable.`
          : 'La escala por defecto es la misma en todos los loci: dos variantes se comparan mirando dos mapas.',
      ),
    );
  }

  let body: HTMLElement | null = null;

  function render(): void {
    clear(container);
    body = el(
      'div',
      { class: 'contacts' },
      verdict(),
      doc.finding ? findingBlock(doc) : el('span', {}),
      biosampleNote(),
      readout,
      stage,
      el('div', { class: 'contacts__legends' }, refLegend(), deltaLegend()),
      controls(),
      aviBridge(),
    );
    container.append(
      panel(
        {
          title: 'Contactos 3D, REF vs ALT',
          subtitle: doc.interval
            ? fmt.intervalLabel(
                doc.interval.chromosome,
                doc.interval.start,
                doc.interval.end,
              )
            : undefined,
          hint:
            'Arriba la estructura que ya hay; abajo lo que la variante le hace. ' +
            'El recuadro marca la fila y la columna del bin de la variante, que es ' +
            'exactamente lo que mide el feature de contactos del AVI.',
          actions: [sourceChip(doc.provenance)],
        },
        body,
      ),
      predictionNotice(),
      provenanceStrip(doc.provenance),
    );
    draw();
  }

  function describe(cell: Cell): { title: string; rows: TooltipRow[] } {
    const res = doc.resolution ?? 0;
    const start = doc.interval?.start ?? 0;
    const a = start + cell.i * res;
    const b = start + cell.j * res;
    const sep = Math.abs(cell.i - cell.j) * res;
    const upper = cell.j >= cell.i;
    // Las dos mitades ensenan siempre AMBOS numeros: si el tooltip mostrara
    // solo el de su mitad, comparar estructura con cambio obligaria a cruzar
    // la diagonal con el raton y recordar la cifra de enfrente.
    const rows: TooltipRow[] = [
      { label: 'Estructura REF', value: fmt.signed4(refAt(cell.i, cell.j)), emphasis: upper },
      { label: 'Cambio ALT menos REF', value: fmt.signed4(deltaAt(cell.i, cell.j)), emphasis: !upper },
      { label: 'Separacion', value: fmt.span(sep) },
      { label: 'Bins', value: `${fmt.int(a)} / ${fmt.int(b)}` },
    ];
    if (cell.i === vbin || cell.j === vbin) {
      rows.push({ label: 'Cruz del AVI', value: 'si', emphasis: true });
    }
    return { title: upper ? 'Estructura (REF)' : 'Cambio (ALT menos REF)', rows };
  }

  function onMove(event: PointerEvent): void {
    const cell = cellAt(event.clientX, event.clientY);
    hover = cell;
    if (!cell) {
      tip.hide();
      readout.textContent = '';
      draw();
      return;
    }
    const { title, rows } = describe(cell);
    readout.textContent = `${title} - ${rows.map((r) => `${r.label}: ${r.value}`).join(' / ')}`;
    tip.show(title, rows, event.clientX, event.clientY);
    draw();
  }

  function onLeave(): void {
    hover = null;
    tip.hide();
    readout.textContent = '';
    draw();
  }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);

  render();

  const stopResize = onResize(container, (w) => {
    width = w;
    draw();
  });
  const stopTheme = onThemeChange(draw);

  return () => {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    stopResize();
    stopTheme();
    tip.hide();
  };
}

/**
 * El hallazgo redactado. Misma regla que en el sashimi: el texto lleva la
 * afirmacion y jamas las cifras; las cifras las pone la vista desde el propio
 * artefacto, arriba, en el veredicto.
 */
function findingBlock(doc: ContactsDoc): HTMLElement {
  return el(
    'section',
    { class: 'finding' },
    el('h3', { class: 'finding__title' }, 'El hallazgo'),
    el('p', { class: 'finding__text' }, doc.finding ?? ''),
    el(
      'p',
      { class: 'finding__method' },
      `Salió de medir, no de buscar: el dominio del color es una constante del pipeline (±${fmt.fixed2(doc.domain ?? 1)}) y no se ajustó a estos datos, así que un mapa plano aquí significa que no hay nada que pintar. El máximo se midió sobre la ventana de 1 Mb que se le dio al modelo, no sobre el recorte que se dibuja.`,
    ),
  );
}
