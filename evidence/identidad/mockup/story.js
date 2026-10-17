// Chapter 1 mockup: the molecule (every atom of 1BNA) and the one reading-level switch.
import { mountMolecule } from './mol.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = () => innerWidth <= 760;
// Desktop: centred in the right half and as tall as the screen. Phone: the top 58 % of the screen.
const place = () => (phone() ? { zoom: 0.62, offsetX: 0, offsetY: 0.44 } : { zoom: 0.8, offsetX: 0.4, offsetY: 0.12 });

const canvas = document.getElementById('mol');
let mol = null;
try {
  const p = place();
  mol = await mountMolecule(canvas, '../data/1bna.atoms', { ...p, upZ: true, pitch: 0.18, reduced });
  addEventListener('resize', () => { const q = place(); mol.setZoom(q.zoom); mol.setOffset(q.offsetX, q.offsetY); });
  window.__mol = mol;
} catch (e) {
  canvas.remove();
  document.getElementById('drag-hint')?.remove();
}

// One switch for every block; remembered.
const KEY = 'agp-mockup-register';
const apply = (reg) => {
  document.querySelectorAll('[data-reg]').forEach((p) => { p.hidden = p.dataset.reg !== reg; });
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.set === reg)));
};
let saved = null;
try { saved = localStorage.getItem(KEY); } catch {}
apply(saved || 'kid');
document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
  apply(b.dataset.set);
  try { localStorage.setItem(KEY, b.dataset.set); } catch {}
}));
