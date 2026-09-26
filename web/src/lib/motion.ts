/**
 * Movimiento, sin librerias: IntersectionObserver para las entradas al hacer
 * scroll y la Web Animations API para el resto.
 *
 * Tres reglas, las tres medidas o comprobadas por `verify`:
 *
 * 1. Todo pasa por `motionOn()`. La clase `motion` la pone el script de
 *    arranque SOLO si hay JavaScript y `prefers-reduced-motion` no pide
 *    reducir. Sin ella, el CSS no esconde nada y aqui no se anima nada: la
 *    pagina es la misma, quieta.
 * 2. Solo `opacity` y `transform`. Ninguna animacion cambia el layout, asi que
 *    ninguna puede sumar CLS.
 * 3. Nada que ya se vea al pintar se esconde. Una entrada al hacer scroll solo
 *    se aplica a lo que empieza por debajo del pliegue; lo de arriba se pinta
 *    tal cual. Esconder el titular para "revelarlo" retrasaria el LCP a cambio
 *    de un efecto.
 */

export function motionOn(): boolean {
  return document.documentElement.classList.contains('motion');
}

let observer: IntersectionObserver | null = null;

function revealObserver(): IntersectionObserver {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer?.unobserve(entry.target);
      }
    },
    // Un poco antes de que asome: la entrada termina cuando el ojo llega.
    { rootMargin: '0px 0px -6% 0px', threshold: 0.04 },
  );
  return observer;
}

/**
 * Entradas al hacer scroll para los bloques de `root` que empiezan por debajo
 * del pliegue: paneles y cualquier `[data-reveal]`.
 */
export function revealOnScroll(root: HTMLElement): void {
  if (!motionOn() || !('IntersectionObserver' in window)) return;
  const fold = window.innerHeight;
  const io = revealObserver();
  const blocks = root.querySelectorAll<HTMLElement>('.panel, [data-reveal]');
  blocks.forEach((block, i) => {
    if (block.getBoundingClientRect().top < fold) return;
    block.classList.add('reveal');
    // Escalonado leve entre bloques que entran juntos (una rejilla de dos).
    block.style.setProperty('--reveal-delay', `${(i % 2) * 60}ms`);
    io.observe(block);
  });
}

// Imprimir o guardar como PDF no hace scroll: todo lo pendiente se muestra.
window.addEventListener('beforeprint', () => {
  // i18n-ok: CSS selector, not text.
  document.querySelectorAll('.reveal:not(.is-in)').forEach((n) => n.classList.add('is-in'));
});

/**
 * Transicion entre vistas: la nueva entra con un fundido y un desplazamiento
 * corto. No se aplica a la primera vista de la visita: esa es la que mide el
 * LCP y tiene que pintarse ya.
 */
let firstView = true;
export function enterView(main: HTMLElement): void {
  if (firstView) {
    firstView = false;
    return;
  }
  if (!motionOn() || typeof main.animate !== 'function') return;
  main.animate(
    [
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
}

/**
 * Barras que se dibujan: cada una crece en X desde su extremo de partida, una
 * detras de otra. `transform-box: fill-box` (en CSS) hace que el origen sea la
 * propia barra y no el SVG entero.
 *
 * @param from Por barra, 'left' si crece hacia la derecha, 'right' si al reves.
 */
export function drawBars(
  bars: { node: SVGElement; from: 'left' | 'right' }[],
  { delay = 0, stagger = 70 }: { delay?: number; stagger?: number } = {},
): void {
  if (!motionOn()) return;
  bars.forEach(({ node, from }, i) => {
    if (typeof node.animate !== 'function') return;
    node.style.transformOrigin = from === 'left' ? 'left center' : 'right center';
    node.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: 520,
      delay: delay + i * stagger,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'backwards',
    });
  });
}

/** Aparicion simple de un nodo (etiquetas, marcas) tras un retraso. */
export function fadeIn(node: Element, delay = 0): void {
  if (!motionOn() || typeof (node as HTMLElement).animate !== 'function') return;
  (node as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 320,
    delay,
    easing: 'ease-out',
    fill: 'backwards',
  });
}
