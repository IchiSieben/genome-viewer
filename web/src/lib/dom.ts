/** Utilidades minimas de DOM. No es un framework y no pretende serlo. */

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string | null | undefined | false;

function applyAttrs(node: Element, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.setAttribute('class', String(value));
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else node.setAttribute(key, String(value));
  }
}

function appendAll(node: Element, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

/** Crea un elemento HTML. `el('p', {class: 'x'}, 'hola')`. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  appendAll(node, children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Crea un elemento SVG. Necesita el namespace, si no el navegador lo ignora. */
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  applyAttrs(node, attrs);
  appendAll(node, children);
  return node;
}

/** Vacia un contenedor. */
export function clear(node: Element): void {
  node.replaceChildren();
}

/**
 * Lee un token CSS resuelto.
 *
 * Canvas no entiende `var(--x)`: hay que darle un color literal. Leer el token
 * del DOM en vez de duplicar los hex en JS es lo que mantiene un solo sistema
 * visual y hace que el cambio de tema funcione tambien en el canvas.
 */
export function token(name: string, root: Element = document.documentElement): string {
  return getComputedStyle(root).getPropertyValue(name).trim();
}

/**
 * Observa cambios de tema y avisa.
 *
 * Se escuchan las dos fuentes: el atributo `data-theme` que pone el boton y la
 * media query del sistema para cuando no hay eleccion explicita.
 */
export function onThemeChange(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', callback);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', callback);
  };
}

/**
 * Canvas con densidad de pixel correcta.
 *
 * Sin esto, en una pantalla Retina cada linea se dibuja borrosa: el canvas
 * tiene la mitad de pixeles reales que el area que ocupa.
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo obtener el contexto 2d del canvas');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Llama a `callback` cuando el elemento cambia de tamano. */
export function onResize(node: Element, callback: (width: number) => void): () => void {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = entry.contentRect.width;
      if (width > 0) callback(width);
    }
  });
  observer.observe(node);
  return () => observer.disconnect();
}
