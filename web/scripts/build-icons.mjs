// Icons and Open Graph images, rendered at build time with Playwright.
//
// - favicon-32.png and apple-touch-icon.png (180) from public/favicon.svg:
//   the SVG is the source of truth; the PNGs exist for browsers and home
//   screens that do not take SVG icons.
// - og-en.png / og-es.png (1200x630), one per language, referenced by the
//   <head> that build-shells.mjs writes. They carry the wordmark, the tagline
//   and the SHAP cascade of the featured variant, drawn from the frozen
//   card.json in dist/data: the same data the home page shows, not a mockup.
//
// Headless Chromium is already a dev dependency (verify, measure). If it is
// missing, the build fails here instead of shipping a page whose og:image 404s.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '../dist');
const I18N = resolve(here, '../src/i18n');
const svgIcon = readFileSync(resolve(here, '../public/favicon.svg'), 'utf8');

const dict = (lang) => JSON.parse(readFileSync(resolve(I18N, `${lang}.json`), 'utf8'));

// Light-theme tokens (src/styles/tokens.css). Duplicated on purpose: the OG
// image is a static picture, it cannot read CSS custom properties.
const C = {
  bg: '#fcfcfb',
  ink: '#1a1a19',
  muted: '#5b5b58',
  faint: '#8a8a86',
  rule: '#e5e5e1',
  pos: '#e34948',
  neg: '#2a78d6',
};

const index = JSON.parse(readFileSync(resolve(DIST, 'data/index.json'), 'utf8'));
const featured = index.featured;
let card = null;
if (featured) {
  const p = resolve(DIST, `data/loci/${featured.locus}/variants/${featured.variant}/card.json`);
  if (existsSync(p)) card = JSON.parse(readFileSync(p, 'utf8'));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The same cascade as miniCascade() in variantCard.ts, as a static SVG. */
function cascadeSvg(d, width) {
  if (!card) return '';
  const sorted = [...card.features].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const top = sorted.slice(0, 6);
  const restSum = sorted.slice(6).reduce((s, f) => s + f.contribution, 0);
  const base = card.avi.baseValue ?? 0;
  let cum = base;
  const rows = top.map((f) => {
    const from = cum;
    cum += f.contribution;
    return { label: d[`data.feature.${f.id}`] ?? f.label, from, to: cum, v: f.contribution };
  });
  if (sorted.length > 6) {
    const n = sorted.length - 6;
    const label = (d[`home.hero.cascade.rest.${n === 1 ? 'one' : 'other'}`] || '').replace('{n}', n);
    rows.push({ label, from: cum, to: cum + restSum, v: restSum });
    cum += restSum;
  }
  const vals = rows.flatMap((r) => [r.from, r.to]).concat(base);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.06 || 0.05;
  const LABEL = 250;
  const plot = width - LABEL - 20;
  const x = (v) => LABEL + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * plot;
  const ROW = 34;
  const h = rows.length * ROW + 10;
  const bars = rows
    .map((r, i) => {
      const y = i * ROW;
      const x0 = Math.min(x(r.from), x(r.to));
      const w = Math.max(3, Math.abs(x(r.to) - x(r.from)));
      return (
        `<text x="${LABEL - 16}" y="${y + 22}" text-anchor="end" font-size="20" fill="${C.muted}">${esc(r.label)}</text>` +
        `<rect x="${x0}" y="${y + 6}" width="${w}" height="22" rx="3" fill="${r.v >= 0 ? C.pos : C.neg}"/>`
      );
    })
    .join('');
  return (
    `<svg width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<line x1="${x(base)}" x2="${x(base)}" y1="0" y2="${h}" stroke="${C.faint}" stroke-dasharray="4 4"/>` +
    bars +
    `<line x1="${x(cum)}" x2="${x(cum)}" y1="0" y2="${h}" stroke="${C.ink}" stroke-width="2"/>` +
    `</svg>`
  );
}

function ogHtml(lang) {
  const d = dict(lang);
  const variant = card
    ? `${card.variant.chromosome}:${Number(card.variant.position).toLocaleString('en')} ${card.variant.ref}>${card.variant.alt}` +
      (card.variant.gene ? ` · ${card.variant.gene}` : '')
    : '';
  const mark = svgIcon.replace('<svg ', '<svg width="64" height="64" ');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 1200px; height: 630px; background: ${C.bg}; color: ${C.ink};
      font-family: "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
      padding: 64px 72px; display: grid; grid-template-rows: auto 1fr auto; }
    .brand { display: flex; align-items: center; gap: 20px; }
    .name { font-size: 40px; font-weight: 650; letter-spacing: -0.02em; }
    .unofficial { font-size: 22px; color: ${C.muted}; border: 1.5px solid ${C.rule};
      border-radius: 6px; padding: 2px 12px; margin-left: 6px; }
    .main { display: grid; grid-template-columns: 1fr 1.15fr; gap: 56px; align-items: center; }
    .tagline { font-size: 54px; line-height: 1.08; font-weight: 650; letter-spacing: -0.03em; }
    .variant { margin-top: 22px; font: 22px ui-monospace, Consolas, monospace; color: ${C.muted}; }
    .foot { font-size: 19px; color: ${C.faint}; border-top: 1.5px solid ${C.rule}; padding-top: 18px; }
  </style></head><body>
    <div class="brand">${mark}<span class="name">${esc(d['brand.name'])}</span><span class="unofficial">${esc(d['brand.unofficial'])}</span></div>
    <div class="main">
      <div><div class="tagline">${esc(d['brand.tagline'])}</div><div class="variant">${esc(variant)}</div></div>
      <div>${cascadeSvg(d, 600)}</div>
    </div>
    <div class="foot">${esc(d['brand.disclaimer'])}</div>
  </body></html>`;
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const lang of ['en', 'es']) {
    await page.setContent(ogHtml(lang));
    await page.screenshot({ path: resolve(DIST, `og-${lang}.png`) });
    console.log(`build-icons: og-${lang}.png`);
  }
  for (const [file, size] of [
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    // apple-touch-icon: iOS puts it on a tile, so it gets the page background
    // and some margin; the 32 px favicon is transparent and edge to edge.
    const tile = size > 64;
    await page.setContent(
      `<html><body style="margin:0;background:${tile ? C.bg : 'transparent'}">` +
        `<div style="width:${size}px;height:${size}px;display:grid;place-items:center">` +
        svgIcon.replace('<svg ', `<svg width="${tile ? size * 0.7 : size}" height="${tile ? size * 0.7 : size}" `) +
        `</div></body></html>`,
    );
    await page.screenshot({ path: resolve(DIST, file), omitBackground: !tile });
    console.log(`build-icons: ${file}`);
  }
} finally {
  await browser.close();
}
