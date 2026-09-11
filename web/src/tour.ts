/**
 * Tutorial de apertura.
 *
 * Regla del portafolio: todo demo arranca explicando que es, que hace y como se
 * usa. Se muestra una vez, es descartable en cualquier momento y se puede
 * volver a lanzar desde la cabecera.
 *
 * Es un recorrido de tarjetas ancladas a elementos reales de la pagina. Si el
 * elemento anclado no existe todavia, el paso se salta en vez de apuntar al
 * vacio.
 */

import { el, clear } from './lib/dom';

const SEEN_KEY = 'agp-tour-seen';

interface Step {
  /** Selector del elemento a resaltar. Vacio = tarjeta centrada. */
  target?: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: 'Predicciones de AlphaGenome, en el navegador',
    body:
      'AlphaGenome predice el efecto de una variante del genoma sobre once ' +
      'modalidades moleculares. Su libreria oficial dibuja imagenes estaticas; ' +
      'esto es un visor interactivo de esos mismos resultados.',
  },
  {
    target: '.catalog',
    title: 'Empieza por un locus',
    body:
      'Cada locus es una ventana de un millon de pares de bases con sus ' +
      'variantes. Al entrar veras la lista de variantes con su score AVI.',
  },
  {
    target: '.provenance',
    title: 'De donde salio cada numero',
    body:
      'Cada artefacto lleva sellado su origen, la version del cliente y su ' +
      'epoca de calibracion. Si dice "datos sinteticos", son datos de ' +
      'desarrollo y no predicciones reales: la franja lo avisa siempre.',
  },
  {
    target: '.gauge-block',
    title: 'El score AVI y su escala',
    body:
      'El AVI resume el impacto esperado en una escala PHRED. 10 significa el ' +
      '10 % mas alto del genoma, 20 el 1 % y 30 el 0,1 %.',
  },
  {
    target: '.waterfall',
    title: 'De que esta hecho el score',
    body:
      'El AVI se calcula a partir de 18 features. La cascada muestra cuanto ' +
      'aporta cada uno y en que direccion, agrupados en sus cuatro familias.',
  },
  {
    target: '.heatmap-scroll',
    title: 'Ubicuo o especifico de tejido',
    body:
      'Las filas van agrupadas por sistema de organos. Una banda continua de ' +
      'color significa un efecto concentrado en ese sistema; color repartido ' +
      'por todo el mapa significa un efecto ubicuo.',
  },
];

let active = false;

function stepsFor(): Step[] {
  return STEPS.filter((step) => !step.target || document.querySelector(step.target));
}

/** Lanza el recorrido. Publico para el boton "Como se usa". */
export function startTour(): void {
  if (active) return;
  const steps = stepsFor();
  if (!steps.length) return;
  active = true;

  let current = 0;

  const highlight = el('div', { class: 'tour__highlight', 'aria-hidden': 'true' });
  const cardBody = el('div', { class: 'tour__card' });
  const overlay = el(
    'div',
    {
      class: 'tour',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Recorrido de introduccion',
    },
    highlight,
    cardBody,
  );

  const finish = () => {
    active = false;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Sin almacenamiento el recorrido reaparece; molesto pero no roto.
    }
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') finish();
    else if (event.key === 'ArrowRight' || event.key === 'Enter') show(current + 1);
    else if (event.key === 'ArrowLeft') show(current - 1);
  };

  function show(index: number): void {
    if (index < 0) return;
    if (index >= steps.length) return finish();
    current = index;
    const step = steps[index]!;

    const node = step.target ? document.querySelector(step.target) : null;
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const box = node.getBoundingClientRect();
      const pad = 6;
      highlight.style.display = 'block';
      highlight.style.transform = `translate(${box.left - pad}px, ${box.top - pad}px)`;
      highlight.style.width = `${box.width + pad * 2}px`;
      highlight.style.height = `${box.height + pad * 2}px`;
      // La tarjeta se coloca debajo del elemento salvo que no quepa.
      const below = box.bottom + 16;
      cardBody.style.top =
        below + 200 > window.innerHeight ? `${Math.max(16, box.top - 216)}px` : `${below}px`;
      cardBody.style.left = `${Math.min(
        Math.max(16, box.left),
        Math.max(16, window.innerWidth - 396),
      )}px`;
      cardBody.classList.remove('tour__card--centered');
    } else {
      highlight.style.display = 'none';
      cardBody.removeAttribute('style');
      cardBody.classList.add('tour__card--centered');
    }

    clear(cardBody);
    const back = el('button', {
      class: 'button button--quiet',
      type: 'button',
      text: 'Atras',
      disabled: index === 0,
    });
    const next = el('button', {
      class: 'button',
      type: 'button',
      text: index === steps.length - 1 ? 'Empezar' : 'Siguiente',
    });
    const skip = el('button', {
      class: 'tour__skip',
      type: 'button',
      text: 'Saltar',
    });
    back.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => show(index + 1));
    skip.addEventListener('click', finish);

    cardBody.append(
      el(
        'div',
        { class: 'tour__head' },
        el('span', {
          class: 'tour__counter',
          text: `${index + 1} / ${steps.length}`,
        }),
        skip,
      ),
      el('h2', { class: 'tour__title', text: step.title }),
      el('p', { class: 'tour__body', text: step.body }),
      el('div', { class: 'tour__actions' }, back, next),
    );
  }

  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  show(0);
}

/** Lanza el recorrido la primera vez que alguien llega a la portada. */
export function maybeStartTour(routeName: string): void {
  if (routeName !== 'home') return;
  try {
    if (localStorage.getItem(SEEN_KEY)) return;
  } catch {
    return; // Sin almacenamiento no se puede recordar; mejor no insistir.
  }
  // Un cuadro de dialogo antes de que la pagina termine de pintarse se siente
  // como un salto; medio segundo basta para que el contenido este quieto.
  window.setTimeout(startTour, 450);
}
