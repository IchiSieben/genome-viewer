// The stage pages (cover + narrative + scale journey), one static HTML per language.
//
//   dist/index.html     English stage (x-default)
//   dist/es/index.html  Spanish stage
//
// Every word is in the HTML (crawlable, no JS needed to read); the island only adds the
// WebGL layer. Sources, all in the repo:
//   src/i18n/stage.{en,es}.json      interface strings
//   src/i18n/chapters.{en,es}.json   the seven chapters, four registers (optional until E4)
//   src/i18n/refs.json               ONE reference list for both languages (PMID + DOI)
//   public/stage/index.json          the clouds and their PDB provenance (copied by sync-data)
//   docs/evidence/coding-fraction.json  the protein-coding fraction computed from GENCODE
//
// Gates that fail the build (a gate here is cheaper than a correction after publishing):
//   - a [VERIFICAR] marker or an unreplaced {placeholder} in the output
//   - the words "simulación"/"simulation"
//   - "AlphaGenome" used as the product name (brand.name must not contain it)
//   - a citation key without an entry in refs.json
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '../dist');
const I18N = resolve(here, '../src/i18n');
const ROOT = resolve(here, '../..');

const SITE = (process.env.AGP_SITE || 'https://ichisieben.dev').replace(/\/$/, '');
let BASE = process.env.AGP_BASE || '/genome-viewer/';
if (!BASE.startsWith('/')) BASE = '/' + BASE;
if (!BASE.endsWith('/')) BASE += '/';
const NOINDEX = (process.env.AGP_NOINDEX ?? '1') === '1';
const REPO = process.env.AGP_REPO || 'https://github.com/IchiSieben/genome-viewer';

const LANGS = [
  { lang: 'en', dir: '', root: './', locale: 'en_US', toggle: 'es/', other: 'es' },
  { lang: 'es', dir: 'es/', root: '../', locale: 'es_PE', toggle: '../', other: 'en' },
];
const VARIANT = 'ppp1r1a-pde1b/chr12-54578515-C-T';
// Chapter → structure on screen and the exact viewer state that illustrates it (hash, N3).
const CHAPTERS = {
  1: { structure: '1BNA', link: '#/' },
  2: { structure: '4UG0', link: '#/why' },
  3: { structure: '1KX5', link: `#/variant/${VARIANT}?view=signal&tracks=DNASE` },
  4: { structure: '1CDW', link: `#/variant/${VARIANT}?view=tracks` },
  5: { structure: '5FLM', link: `#/variant/${VARIANT}?view=saturation` },
  6: { structure: '5XJC', link: '#/variant/dnm1/chr9-128226027-G-A?view=splice' },
  7: { structure: '5KKQ', link: '#/variant/celsr2-psrc1/chr1-109274968-G-T?view=contact' },
};
const DEFAULT_REGISTER = 'kid';

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const dicts = Object.fromEntries(LANGS.map(({ lang }) => [lang, readJson(resolve(I18N, `stage.${lang}.json`))]));
const chapters = Object.fromEntries(LANGS.map(({ lang }) => [lang, readJson(resolve(I18N, `chapters.${lang}.json`), null)]));
const refs = readJson(resolve(I18N, 'refs.json'), {});
const stageIndex = readJson(resolve(here, '../public/stage/index.json'), { structures: [] });
const coding = readJson(resolve(ROOT, 'docs/evidence/coding-fraction.json'), null);
const scaleStops = readJson(resolve(I18N, 'scale.json'), null);

const esc = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const urlOf = (dir) => `${SITE}${BASE}${dir}`;
const byId = Object.fromEntries(stageIndex.structures.map((s) => [s.id, s]));

function fmtNum(lang, x, digits = 1) {
  return new Intl.NumberFormat(lang === 'es' ? 'es' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);
}

// Two decimals for the expert register (the range is 1.08-1.26: one decimal would collapse it);
// one decimal everywhere else, read aloud by an 8-year-old as "letters out of a hundred".
function fill(text, lang, digits = 1) {
  if (!coding) return text;
  return text
    .replaceAll('{coding_pct}', fmtNum(lang, coding.pointPct, digits))
    .replaceAll('{coding_lo}', fmtNum(lang, coding.rangePct[0], digits))
    .replaceAll('{coding_hi}', fmtNum(lang, coding.rangePct[1], digits))
    .replaceAll('{exons_pct}', fmtNum(lang, coding.exonsPct, digits));
}

// ---- references: numbered by first appearance, one list for both languages -------------------
const order = [];
const cite = (key) => {
  if (!refs[key]) throw new Error(`build-stage: citation key "${key}" missing from src/i18n/refs.json`);
  if (!order.includes(key)) order.push(key);
  return order.indexOf(key) + 1;
};
// Walk chapters in order once (English then Spanish share keys) so numbers are identical.
for (const L of LANGS) {
  for (const ch of chapters[L.lang]?.chapters ?? []) for (const b of ch.blocks) for (const k of b.refs) cite(k);
}
for (const k of scaleStops?.refs ?? []) cite(k);

function paragraphs(text, lang, digits = 1) {
  return fill(text, lang, digits)
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim())}</p>`)
    .join('');
}

function caption(id, L) {
  const d = dicts[L.lang];
  const s = byId[id];
  if (!s) return '';
  const p = s.provenance;
  const method = d[`method.${p.experimentalMethod}`] || p.experimentalMethod;
  return `${esc(d['caption.prefix'])} · <b>${esc(d[`structure.${id}`] || id)}</b> · ` +
    `<a href="${esc(p.url)}" target="_blank" rel="noopener">PDB ${esc(id)}</a> · ${esc(method)} ${fmtNum(L.lang, p.resolutionA)} ${esc(d['caption.res'])}`;
}

function chapterHtml(ch, L) {
  const d = dicts[L.lang];
  const meta = CHAPTERS[ch.n];
  const blocks = ch.blocks.map((b) => {
    const nums = b.refs.map((k) => cite(k));
    const sup = nums.length
      ? ' ' + nums.map((n) => `<a class="st-ref" href="#ref-${n}" aria-label="${esc(L.lang === 'es' ? 'Referencia' : 'Reference')} ${n}">[${n}]</a>`).join('')
      : '';
    return `<div class="st-block" id="${esc(b.id)}">
  <div class="st-reg" role="group" aria-label="${esc(d['reg.label'])}"><button type="button" data-set="kid" aria-pressed="false">${esc(d['reg.kid'])}</button><button type="button" data-set="phd" aria-pressed="false">${esc(d['reg.phd'])}</button></div>
  <div data-reg="kid">${paragraphs(b.kid, L.lang)}</div>
  <div data-reg="phd">${paragraphs(b.phd, L.lang, 2)}${sup ? `<p>${sup}</p>` : ''}</div>
</div>`;
  });
  return `<section class="st-chapter" id="c${ch.n}" data-structure="${meta.structure}" aria-labelledby="c${ch.n}-t">
<p class="st-num">${esc(d['chapter.label'])} ${ch.n} / 7</p>
<h2 id="c${ch.n}-t">${esc(fill(ch.title, L.lang))}</h2>
<p class="st-kicker">${esc(fill(ch.kicker, L.lang))}</p>
${blocks.join('\n')}
<a class="st-cta" href="app/${meta.link}">${esc(ch.cta)}</a>
<p class="st-struct">${esc(d['chapter.structure'])}: ${caption(meta.structure, L)}</p>
</section>`;
}

function scaleHtml(L) {
  if (!scaleStops) return '';
  const d = dicts[L.lang];
  const stops = scaleStops.stops.map((s) => ({ nm: s.nm, id: s.structure || undefined, label: s[L.lang] }));
  return `<section class="st-scale" id="scale" data-structure="${esc(scaleStops.stops[0].structure)}" data-stops="${esc(JSON.stringify(stops))}" aria-labelledby="scale-t">
<div class="st-scale-sticky">
<h2 id="scale-t" class="st-num">${esc(d['scale.title'])}</h2>
<p class="st-scale-label">${esc(d['scale.lead'])}</p>
<p class="st-scale-ruler" id="st-ruler" aria-hidden="true">2 nm</p>
<p class="st-scale-label" id="st-scale-label">${esc(stops[0].label)}</p>
<details class="st-scale-all"><summary>${esc(d['scale.all'])}</summary><ol>${stops.map((s) => `<li>${esc(s.label)}</li>`).join('')}</ol>
<p>${(scaleStops.refs ?? []).map((k) => { const n = cite(k); return `<a class="st-ref" href="#ref-${n}">[${n}]</a>`; }).join(' ')}</p></details>
</div>
</section>`;
}

function refsHtml(L) {
  const d = dicts[L.lang];
  const items = order.map((k, i) => {
    const r = refs[k];
    const links = [r.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(r.pmid)}/" target="_blank" rel="noopener">PMID ${esc(r.pmid)}</a>` : '',
      r.doi ? `<a href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener">doi:${esc(r.doi)}</a>` : ''].filter(Boolean).join(' · ');
    const pre = r.preprint ? (L.lang === 'es' ? ' (preprint, sin revisión por pares)' : ' (preprint, not peer reviewed)') : '';
    return `<li id="ref-${i + 1}">${esc(r.authors)} (${esc(r.year)}). ${esc(r.title)} <i>${esc(r.journal)}</i>${esc(pre)}. ${links}</li>`;
  });
  const structs = stageIndex.structures.map((s) => {
    const c = s.provenance.citation || {};
    return `<li>${esc(d[`structure.${s.id}`] || s.id)} — <a href="${esc(s.provenance.url)}" target="_blank" rel="noopener">PDB ${esc(s.id)}</a>. ${esc(c.firstAuthor || '')} (${esc(c.year || '')}). ${esc(c.title || '')} <i>${esc(c.journal || '')}</i>. ${c.doi ? `<a href="https://doi.org/${esc(c.doi)}" target="_blank" rel="noopener">doi:${esc(c.doi)}</a>` : ''}</li>`;
  });
  return `<section class="st-refs" id="refs" aria-labelledby="refs-t">
<h2 id="refs-t">${esc(d['refs.title'])}</h2>
<p>${esc(d['refs.lead'])}</p>
${items.length ? `<ol>${items.join('\n')}</ol>` : ''}
<h3>${esc(d['refs.structures'])}</h3>
<ul>${structs.join('\n')}</ul>
</section>`;
}

function body(L) {
  const d = dicts[L.lang];
  const chs = chapters[L.lang]?.chapters ?? [];
  const first = 'c1';
  const posters = stageIndex.structures.map((s) =>
    `<img class="stage-poster" alt="" data-structure="${s.id}" data-src="stage/posters/${s.id.toLowerCase()}.webp" decoding="async" />`).join('');
  const templates = stageIndex.structures.map((s) => `<template data-caption="${s.id}">${caption(s.id, L)}</template>`).join('\n');
  return `<a class="skip" href="#main">${esc(d.skip)}</a>
<div class="stage" aria-hidden="true"><canvas width="1" height="1"></canvas>${posters}</div>
<header class="st-top">
<a class="st-brand" href=".">${esc(d['brand.name'])}</a>
<a href="#refs">${esc(d['nav.refs'])}</a>
<a href="app/">${esc(d['nav.app'])}</a>
<a id="lang-toggle" href="${L.toggle}" hreflang="${L.other}" lang="${L.other}" aria-label="${esc(d['nav.langToggleLabel'])}">${esc(d['nav.langToggle'])}</a>
</header>
<main id="main">
<section class="st-hero" data-structure="1BNA" aria-labelledby="hero-t">
<h1 id="hero-t">${esc(d['hero.title'])}</h1>
<p class="st-lead">${esc(d['hero.lead'])}</p>
<a class="st-action" href="${chs.length ? `#${first}` : 'app/'}">${esc(chs.length ? d['hero.action'] : d['nav.app'])}</a>
</section>
${chs.map((ch) => chapterHtml(ch, L)).join('\n')}
${scaleHtml(L)}
</main>
${refsHtml(L)}
<footer class="st-foot">
<p>${esc(d['foot.real'])}</p>
<p>${esc(d['foot.data'])}</p>
<p><a href="${esc(REPO)}" target="_blank" rel="noopener">${esc(d['foot.repo'])}</a> · <a href="https://ichisieben.dev/" target="_blank" rel="noopener">${esc(d['foot.author'])}</a></p>
</footer>
<p class="st-caption" id="st-caption">${caption('1BNA', L)}</p>
${templates}`;
}

function head(L) {
  const d = dicts[L.lang];
  const url = urlOf(L.dir);
  const og = `${SITE}${BASE}og-stage-${L.lang}.png`;
  const other = dicts[L.other];
  const ld = {
    '@context': 'https://schema.org', '@type': 'WebPage', name: d['meta.title'], description: d['meta.description'],
    url, inLanguage: L.lang, isPartOf: { '@type': 'WebSite', name: d['brand.name'], url: urlOf('') },
    about: ['non-coding DNA', 'genome regulation', 'variant effect prediction'],
  };
  return [
    `<title>${esc(d['meta.title'])}</title>`,
    `<meta name="description" content="${esc(d['meta.description'])}" />`,
    NOINDEX ? '<meta name="robots" content="noindex, nofollow" />' : '',
    `<link rel="canonical" href="${url}" />`,
    ...LANGS.map((x) => `<link rel="alternate" hreflang="${x.lang}" href="${urlOf(x.dir)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${urlOf('')}" />`,
    `<meta name="agp-root" content="${L.root}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(d['brand.name'])}" />`,
    `<meta property="og:title" content="${esc(d['meta.title'])}" />`,
    `<meta property="og:description" content="${esc(d['meta.description'])}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:locale" content="${L.locale}" />`,
    `<meta property="og:locale:alternate" content="${LANGS.find((x) => x.lang === L.other).locale}" />`,
    `<meta property="og:image" content="${og}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${esc(d['meta.ogAlt'])}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:image" content="${og}" />`,
    `<meta name="build-id" content="${esc(process.env.AGP_BUILD_ID || 'dev')}" />`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
    `<!-- alternate title: ${esc(other['meta.title'])} -->`,
  ].filter(Boolean).map((l) => `    ${l}`).join('\n');
}

// ---- assemble ------------------------------------------------------------------------------
const templatePath = resolve(DIST, 'stage.html');
let template = readFileSync(templatePath, 'utf8');
// Inline the stage CSS (one network wave less before the headline paints). Its relative
// url()s point next to the CSS file (assets/): rewrite them to the document's view.
template = template.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/, (whole, href) => {
  const css = readFileSync(resolve(DIST, href), 'utf8').replace(/url\((['"]?)(?!data:|https?:|\/)\.?\/?([^'")]+)\1\)/g, (m, q, p) => `url(${q}./assets/${p.replace(/^assets\//, '')}${q})`);
  return `<style>${css}</style>`;
});
// Preload the font the headline uses; the CSS says font-display: optional, so a slow font
// never swaps after paint (CLS 0) and a fast one is there for the first paint.
const font = readdirSync(resolve(DIST, 'assets')).find((f) => /^inter-var-latin-.*\.woff2$/.test(f));
if (font) template = template.replace('<!-- stage:head -->', `<!-- stage:head -->\n    <link rel="preload" href="./assets/${font}" as="font" type="font/woff2" crossorigin />`);
if (!/<style>/.test(template)) console.warn('build-stage: stage CSS was not inlined');

const forbidden = [/\[VERIFICAR\]/, /\{coding_[a-z]+\}/, /\{[a-z_]+\}/, /simulaci[oó]n/i, /\bsimulation/i];
for (const L of LANGS) {
  let html = template.replace(/<html lang="[a-z]+"/, `<html lang="${L.lang}" data-register-default="${DEFAULT_REGISTER}"`);
  html = html.replace('<!-- stage:head -->', head(L));
  html = html.replace('<!-- stage:body -->', body(L));
  if (L.root !== './') {
    // One level down: Vite's ./assets and ./favicon need ../; the inlined CSS urls too; the
    // posters live at the root (../stage/). Body links stay: href="app/" from /es/ is the
    // Spanish viewer, and the brand link is "." (this directory) at both depths.
    html = html.replace(/(\s(?:src|href)=")\.\/(?!\/)/g, `$1${L.root}`);
    html = html.replace(/url\(\.\/assets\//g, `url(${L.root}assets/`);
    html = html.replace(/data-src="stage\//g, `data-src="${L.root}stage/`);
  }
  const textOnly = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
  for (const re of forbidden) {
    const m = textOnly.match(re);
    if (m) throw new Error(`build-stage (${L.lang}): forbidden text in output: ${m[0]}`);
  }
  if (/AlphaGenome/.test(dicts[L.lang]['brand.name'])) throw new Error('build-stage: product named AlphaGenome');
  const out = resolve(DIST, L.dir, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`build-stage: ${L.dir || '/'}index.html (${L.lang}, ${html.length} B, ${chapters[L.lang]?.chapters?.length ?? 0} chapters, ${order.length} refs)`);
}
unlinkSync(templatePath);
