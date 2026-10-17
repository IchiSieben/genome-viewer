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
import { t } from './i18n';

const SEEN_KEY = 'agp-tour-seen';

interface Step {
  /** Selector del elemento a resaltar. Vacio = tarjeta centrada. */
  target?: string;
  title: string;
  body: string;
}

const STEP_TARGETS: Array<string | undefined> = [
  undefined,
  '.catalog',
  '.provenance',
  '.gauge-block',
  '.waterfall',
  '.browser__stage',
  '.heatmap-scroll',
];

/** No se puede llamar `t()` a nivel de modulo: el diccionario carga despues. */
function allSteps(): Step[] {
  return STEP_TARGETS.map((target, i) => ({
    target,
    title: t(`tour.step.${i}.title`),
    body: t(`tour.step.${i}.body`),
  }));
}

let active = false;

/**
 * Los pasos que existen en esta pagina, en el ORDEN EN QUE ESTAN EN EL DOM.
 *
 * El orden de `STEPS` es el de la narracion, no el de la pagina, y las dos
 * cosas coincidian por casualidad mientras cada vista tenia sus anclas y nada
 * mas. La portada las mezclo: ahora lleva un `.gauge-block` en el heroe, arriba
 * del todo, que en la lista va DESPUES de `.catalog` y de `.provenance`. Seguir
 * la lista tal cual haria que el recorrido bajara al catalogo, bajara al sello
 * y luego subiera de golpe al principio.
 *
 * Ordenar por posicion real cuesta una comparacion y no hay que acordarse de
 * nada al agregar un paso. Los pasos sin ancla se quedan al frente: son la
 * introduccion, y una introduccion no tiene sitio en la pagina al que saltar.
 */
function stepsFor(): Step[] {
  const found = allSteps().map((step) => ({
    step,
    node: step.target ? document.querySelector(step.target) : null,
  })).filter((entry) => !entry.step.target || entry.node);

  const intro = found.filter((entry) => !entry.node).map((entry) => entry.step);
  const anchored = found.filter((entry) => entry.node);
  anchored.sort((a, b) =>
    a.node!.compareDocumentPosition(b.node!) & Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1,
  );
  return [...intro, ...anchored.map((entry) => entry.step)];
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
      'aria-label': t('tour.dialog.ariaLabel'),
    },
    highlight,
    cardBody,
  );

  const finish = () => {
    active = false;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Sin almacenamiento el recorrido reaparece; molesto pero no roto.
    }
  };

  // Escape cierra desde cualquier paso, tenga el foco quien lo tenga (fase de captura). Enter no
  // avanza aqui: el boton enfocado ya lo hace, y los dos juntos saltaban un paso.
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); finish(); }
    else if (event.key === 'ArrowRight') show(current + 1);
    else if (event.key === 'ArrowLeft') show(current - 1);
  };
  // El fondo oscurecido tambien cierra: nunca hay que recargar para salir.
  overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(); });

  const GAP = 16;
  /**
   * Coloca resalte y tarjeta a partir de donde esta el elemento AHORA. Antes se media justo
   * despues de un scrollIntoView suave, con la pagina aun en camino: la tarjeta quedaba donde
   * estaba el elemento antes de desplazarse, y en los ultimos pasos fuera de la pantalla.
   * La tarjeta va debajo si cabe, encima si no, y si no cabe en ningun lado, pegada al borde
   * inferior; siempre entera dentro del viewport. Se recoloca al hacer scroll o cambiar el tamano.
   */
  function place(): void {
    const step = steps[current];
    const node = step?.target ? document.querySelector(step.target) : null;
    if (!node) return;
    const box = node.getBoundingClientRect();
    const pad = 6;
    const vh = window.innerHeight;
    const vw = document.documentElement.clientWidth;
    const top = Math.max(box.top - pad, 0);
    const bottom = Math.min(box.bottom + pad, vh);
    highlight.style.display = bottom > top ? 'block' : 'none';
    highlight.style.transform = `translate(${box.left - pad}px, ${top}px)`;
    highlight.style.width = `${box.width + pad * 2}px`;
    highlight.style.height = `${Math.max(0, bottom - top)}px`;
    const h = cardBody.offsetHeight;
    const w = cardBody.offsetWidth;
    let y: number;
    if (box.bottom + GAP + h <= vh - GAP) y = box.bottom + GAP;
    else if (box.top - GAP - h >= GAP) y = box.top - GAP - h;
    else y = vh - GAP - h;
    cardBody.style.top = `${Math.round(Math.min(Math.max(GAP, y), Math.max(GAP, vh - GAP - h)))}px`;
    cardBody.style.left = `${Math.round(Math.min(Math.max(GAP, box.left), Math.max(GAP, vw - w - GAP)))}px`;
  }

  function show(index: number): void {
    if (index < 0) return;
    if (index >= steps.length) return finish();
    current = index;
    const step = steps[index]!;

    clear(cardBody);
    const back = el('button', {
      class: 'button button--quiet',
      type: 'button',
      text: t('tour.back'),
      disabled: index === 0,
    });
    const next = el('button', {
      class: 'button',
      type: 'button',
      text: index === steps.length - 1 ? t('tour.start') : t('tour.next'),
    });
    const skip = el('button', {
      class: 'tour__skip',
      type: 'button',
      text: t('tour.skip'),
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
          text: t('tour.counter', { current: index + 1, total: steps.length }),
        }),
        skip,
      ),
      el('h2', { class: 'tour__title', text: step.title }),
      el('p', { class: 'tour__body', text: step.body }),
      el('div', { class: 'tour__actions' }, back, next),
    );

    const node = step.target ? document.querySelector(step.target) : null;
    if (node) {
      cardBody.classList.remove('tour__card--centered');
      cardBody.removeAttribute('style');
      // Sin animacion: el elemento llega a su sitio antes de medirlo. Un elemento mas alto que la
      // pantalla se alinea arriba (a un cuarto), para dejar sitio a la tarjeta debajo.
      const r = node.getBoundingClientRect();
      const vh = window.innerHeight;
      const room = vh - cardBody.offsetHeight - 3 * GAP;
      const want = r.height <= room ? (room - r.height) / 2 : vh * 0.12;
      window.scrollTo({ top: window.scrollY + r.top - want, behavior: 'instant' });
      place();
    } else {
      highlight.style.display = 'none';
      cardBody.removeAttribute('style');
      cardBody.classList.add('tour__card--centered');
    }
    next.focus({ preventScroll: true });
  }

  document.body.append(overlay);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place, { passive: true });
  window.addEventListener('scroll', place, { passive: true });
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
