/**
 * Stage page entry: the static HTML (built per language by scripts/build-stage.mjs) already
 * carries every word. This script only wires the register switch, the structure caption and
 * the scroll → structure mapping, and loads the WebGL island after the page has loaded.
 */
import './stage.css';
import type { Island } from './island';

type Register = 'kid' | 'phd';
const REG_KEY = 'agp-register';
const html = document.documentElement;

function readRegister(): Register {
  try {
    const v = localStorage.getItem(REG_KEY);
    if (v === 'kid' || v === 'phd') return v;
  } catch {
    // storage blocked: default below
  }
  return (html.dataset.registerDefault as Register) || 'kid';
}

function applyRegister(r: Register, persist: boolean): void {
  html.dataset.register = r;
  document.querySelectorAll<HTMLButtonElement>('.st-reg button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.set === r));
  });
  if (persist) {
    try { localStorage.setItem(REG_KEY, r); } catch { /* private window: this visit only */ }
  }
}

applyRegister(readRegister(), false);
document.addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('.st-reg button');
  if (!b) return;
  const block = b.closest('.st-block');
  const before = block?.getBoundingClientRect().top ?? 0;
  applyRegister(b.dataset.set as Register, true);
  // Keep the block the reader clicked in the same place: other blocks change height.
  // `instant`: the page has scroll-behavior: smooth, which would animate the correction.
  if (block) window.scrollBy({ top: block.getBoundingClientRect().top - before, behavior: 'instant' });
});

// ---- caption: which real structure is on screen ------------------------------------------
const caption = document.getElementById('st-caption');
const captions = new Map<string, string>();
document.querySelectorAll<HTMLTemplateElement>('template[data-caption]').forEach((t) => {
  captions.set(t.dataset.caption!, t.innerHTML);
});
function setCaption(id: string): void {
  if (caption && captions.has(id)) caption.innerHTML = captions.get(id)!;
}

// ---- scroll → structure --------------------------------------------------------------------
const root = document.querySelector<HTMLElement>('.stage');
// Only the text sections: the poster <img>s inside the fixed .stage carry data-structure too, and
// the first of them always covers mid-screen (it pinned every chapter to 1BNA).
const sections = Array.from(document.querySelectorAll<HTMLElement>('main [data-structure]'));
const firstId = sections[0]?.dataset.structure || '1BNA';
let island: Island | null = null;
// `?still=<PDB id>` holds one structure, frozen (scripts/build-posters.mjs renders the posters).
const still = new URLSearchParams(location.search).get('still');
let currentId = still || firstId;

function pick(): void {
  const mid = window.innerHeight * 0.5;
  let best: HTMLElement | null = null;
  for (const s of sections) {
    const r = s.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) { best = s; break; }
  }
  const id = best?.dataset.structure;
  if (!id || id === currentId) return;
  currentId = id;
  setCaption(id);
  island?.show(id);
}

// ---- scale journey: scroll progress → size of one structure, ruler text ---------------------
const scale = document.querySelector<HTMLElement>('.st-scale');
const ruler = document.getElementById('st-ruler');
const scaleLabel = document.getElementById('st-scale-label');
type Stop = { nm: number; id?: string; label: string };
const stops: Stop[] = scale ? JSON.parse(scale.dataset.stops || '[]') : [];
const fmt = new Intl.NumberFormat(html.lang === 'es' ? 'es' : 'en-US', { maximumFractionDigits: 1 });
function human(nm: number): string {
  if (nm < 1000) return `${fmt.format(nm)} nm`;
  if (nm < 1e6) return `${fmt.format(nm / 1000)} µm`;
  if (nm < 1e9) return `${fmt.format(nm / 1e6)} mm`;
  return `${fmt.format(nm / 1e9)} m`;
}
function onScale(): void {
  if (!scale || stops.length < 2) return;
  const r = scale.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
  if (r.top > window.innerHeight || r.bottom < 0) return;
  // Log-linear between stops: the camera "zooms out" at constant speed in orders of magnitude.
  const span = stops.length - 1;
  const k = Math.min(span - 1, Math.floor(p * span));
  const f = p * span - k;
  const nm = Math.exp(Math.log(stops[k]!.nm) * (1 - f) + Math.log(stops[k + 1]!.nm) * f);
  if (ruler) ruler.textContent = human(nm);
  const near = (f < 0.5 ? stops[k] : stops[k + 1])!;
  if (scaleLabel && scaleLabel.dataset.at !== near.label) {
    scaleLabel.dataset.at = near.label;
    scaleLabel.textContent = near.label;
  }
  // The molecule on screen keeps its physical size relative to the field of view: field = nm.
  const shown = [...stops.slice(0, k + 2)].reverse().find((s) => s.id);
  if (shown?.id && island) {
    const st = stops.find((s) => s.id === shown.id)!;
    island.setScale(shown.id, Math.max(0.002, Math.min(1.4, st.nm / nm)));
    if (currentId !== shown.id) { currentId = shown.id; setCaption(shown.id); }
  }
}

let ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const inScale = scale && scale.getBoundingClientRect().top < window.innerHeight * 0.5 && scale.getBoundingClientRect().bottom > window.innerHeight * 0.5;
    if (inScale) onScale(); else pick();
  });
}, { passive: true });
setCaption(currentId);

// ---- the island, after load ---------------------------------------------------------------
function boot(): void {
  if (!root) return;
  const base = (document.querySelector<HTMLMetaElement>('meta[name="agp-root"]')?.content || './') + 'stage/';
  void import('./island')
    .then((m) => m.mountIsland(root, base, currentId))
    .then((i) => {
      island = i;
      if (currentId !== firstId) i.show(currentId);
      if (!still) pick();
    })
    .catch((e) => {
      console.warn('stage: island failed', e);
      root.classList.add('is-poster');
    });
}
const later = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
if (document.readyState === 'complete') later(boot);
else window.addEventListener('load', () => later(boot), { once: true });
