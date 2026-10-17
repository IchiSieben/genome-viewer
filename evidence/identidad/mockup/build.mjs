// Phase B mockup: chapter 1 of the story and the viewer's cover, ES and EN, in the proposed
// identity. Every sentence and figure comes from the repo (chapters.*.json, stage.*.json, *.json,
// the variant card, the stage index, the coding fraction); nothing is retyped here.
//
// Uso: node build.mjs [repo root]   -> es/capitulo-1.html, en/chapter-1.html, es/visor.html, en/viewer.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.argv[2] || resolve(HERE, '../../..'));
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const coding = read('docs/evidence/coding-fraction.json');
const card = read('web/public/data/loci/apoa1/variants/chr11-116837649-T-G/card.json');
const s1bna = read('web/public/stage/index.json').structures.find((s) => s.id === '1BNA');
const atoms = JSON.parse(readFileSync(resolve(HERE, 'data/1bna.atoms.json'), 'utf8'));
const SEQ = 'CGCGAATTCGCG'; // both chains of 1BNA, read with gemmi from data/raw/pdb/1bna.cif.gz

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Atkinson has no superscript digits: write 10⁹ as 10<sup>9</sup> so the face never falls back.
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '−' };
const sup = (s) => s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => `<sup>${[...m].map((c) => SUP[c]).join('')}</sup>`);
const nf = (lang, o) => new Intl.NumberFormat(lang === 'es' ? 'es' : 'en-US', o);
const num = (lang, x, d = 1) => nf(lang, { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
const fill = (t, lang, d) => t.replaceAll('{coding_pct}', num(lang, coding.pointPct, d))
  .replaceAll('{coding_lo}', num(lang, coding.rangePct[0], d)).replaceAll('{coding_hi}', num(lang, coding.rangePct[1], d))
  .replaceAll('{exons_pct}', num(lang, coding.exonsPct, d));

// Own calculations shown as figures (each one also stated in the chapter's own text).
const BP = 3.055e9;                        // Nurk 2022, haploid T2T-CHM13
const YEARS = BP / (365.25 * 86400);       // one letter per second
const METRES = 6.11e9 * 0.3347e-9;         // the chapter's own product: 6.11e9 bp (2n, rounded) x rise measured on 1BNA

const COPY = {
  es: {
    file: { story: 'capitulo-1.html', viewer: 'visor.html' }, other: 'en', otherFile: { story: 'chapter-1.html', viewer: 'viewer.html' },
    years: (y) => `Leyendo una letra por segundo, sin dormir: <b>${num('es', y, 0)} años</b> para una sola copia. Cada cuadro es un año.`,
    yearsCite: 'cálculo propio: 3,055 × 10<sup>9</sup> s ÷ 31 557 600 s/año',
    lettersCap: 'letras en una copia del genoma humano', lettersCite: 'T2T-CHM13 · Nurk 2022',
    metresCap: 'de ADN en cada célula con núcleo, si se estirara', metresCite: 'cálculo propio: 6,11 × 10<sup>9</sup> pb × 0,3347 nm, paso medido sobre 1BNA',
    door: 'una puerta', thread: 'el hilo de una célula',
    cellsWord: '30 billones', cellsCap: 'de células en un adulto de 70 kg', cellsCite: 'Sender 2016 · Bianconi 2013 dio 3,72 × 10<sup>13</sup>',
    cellsAxis: 'Lo que se había publicado antes iba de 10<sup>12</sup> a 10<sup>16</sup> (Bianconi 2013). Una marca por orden de magnitud.',
    codingCap: 'de cada 100 letras explican cómo armar proteínas', codingCite: 'cálculo propio con GENCODE 50 sobre GRCh38',
    legendTitle: 'Lo que ves: cada esfera es un átomo de',
    legendBases: { A: 'adenina', C: 'citosina', G: 'guanina', T: 'timina' }, backbone: 'esqueleto de azúcar y fosfato',
    seqLabel: 'secuencia de cada hebra',
    thousand: (n) => `Cada punto es una letra de mil: <b>${n}</b> encendidas.`,
    drag: 'Arrástrala para girarla',
    vTitle: 'Qué le hace una variante al genoma, predicho',
    top: (v) => `en el ${v} % más alto de todo el genoma`,
    gaugeTicks: ['10 %', '1 %', '0,1 %', '0,01 %'], gaugeLabel: 'cuán rara es una variante con este score',
    rest: (n) => `${n} features más`, base: 'valor base', score: 'score',
    noDx: 'Es una predicción de efecto regulatorio, no un diagnóstico.',
    proposal: 'Propuesta de identidad · fase B · no es el sitio publicado',
  },
  en: {
    file: { story: 'chapter-1.html', viewer: 'viewer.html' }, other: 'es', otherFile: { story: 'capitulo-1.html', viewer: 'visor.html' },
    years: (y) => `Reading one letter per second, never sleeping: <b>${num('en', y, 0)} years</b> for a single copy. Each square is one year.`,
    yearsCite: 'own calculation: 3.055 × 10<sup>9</sup> s ÷ 31,557,600 s/year',
    lettersCap: 'letters in one copy of the human genome', lettersCite: 'T2T-CHM13 · Nurk 2022',
    metresCap: 'of DNA in every nucleated cell, stretched out', metresCite: 'own calculation: 6.11 × 10<sup>9</sup> bp × 0.3347 nm, rise measured on 1BNA',
    door: 'a door', thread: 'one cell’s thread',
    cellsWord: '30 trillion', cellsCap: 'cells in a 70 kg adult', cellsCite: 'Sender 2016 · Bianconi 2013 gave 3.72 × 10<sup>13</sup>',
    cellsAxis: 'Earlier published figures ranged from 10<sup>12</sup> to 10<sup>16</sup> (Bianconi 2013). One mark per order of magnitude.',
    codingCap: 'out of every 100 letters tell the body how to build proteins', codingCite: 'own calculation from GENCODE 50 on GRCh38',
    legendTitle: 'What you see: every sphere is one atom of',
    legendBases: { A: 'adenine', C: 'cytosine', G: 'guanine', T: 'thymine' }, backbone: 'sugar-phosphate backbone',
    seqLabel: 'sequence of each strand',
    thousand: (n) => `Each dot is one letter in a thousand: <b>${n}</b> lit.`,
    drag: 'Drag it to turn it',
    vTitle: 'What a variant does to the genome, predicted',
    top: (v) => `in the top ${v}% of the whole genome`,
    gaugeTicks: ['10%', '1%', '0.1%', '0.01%'], gaugeLabel: 'how rare a variant with this score is',
    rest: (n) => `${n} more features`, base: 'base value', score: 'score',
    noDx: 'It is a prediction of regulatory effect, not a diagnosis.',
    proposal: 'Identity proposal · phase B · not the published site',
  },
};

function bar(lang, st, ui, page) {
  const c = COPY[lang];
  return `<header class="bar">
  <a class="brand" href="./${c.file.story}"><span class="brand-mark" aria-hidden="true"><i style="background:var(--base-a)"></i><i style="background:var(--base-c)"></i><i style="background:var(--base-g)"></i><i style="background:var(--base-t)"></i></span>${esc(st['brand.name'])}</a>
  ${page === 'story' ? `<div class="level" role="group" aria-label="${esc(st['reg.label'])}"><span class="level-label">${esc(st['reg.label'])}</span><span class="seg"><button data-set="kid" aria-pressed="true">${esc(st['reg.kid'])}</button><button data-set="phd" aria-pressed="false">${esc(st['reg.phd'])}</button></span></div>` : ''}
  <nav><a href="./${page === 'story' ? c.file.viewer : c.file.story}">${esc(page === 'story' ? st['nav.app'] : ui.storyLink)}</a><a href="../${c.other}/${c.otherFile[page]}" lang="${c.other}">${esc(st['nav.langToggle'])}</a></nav>
</header>`;
}

function head(lang, title, extra = '') {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="preload" href="../fonts/bricolage-grotesque.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../system.css">
${extra}
</head>`;
}

// ---- chapter 1 -----------------------------------------------------------------------------
function story(lang) {
  const c = COPY[lang];
  const st = read(`web/src/i18n/stage.${lang}.json`);
  const ch = read(`web/src/i18n/chapters.${lang}.json`);
  const c1 = (Array.isArray(ch) ? ch : ch.chapters)[0];
  const blocks = Object.fromEntries(c1.blocks.map((b) => [b.id, b]));
  const block = (id) => {
    const b = blocks[id];
    return `<div class="prose block" data-block="${id}">
      <p data-reg="kid">${sup(esc(fill(b.kid, lang, 1)))}</p>
      <p data-reg="phd" hidden>${sup(esc(fill(b.phd, lang, 2)))}</p>
      <p class="refs">${b.refs.map((r) => esc(r.replace(/(\d{4})$/, ' $1'))).join(' · ')}</p>
    </div>`;
  };
  const m = s1bna.provenance;
  const method = st[`method.${m.experimentalMethod}`] || m.experimentalMethod;
  const res = num(lang, m.resolutionA, 1);
  const yearsN = Math.round(YEARS);
  const cellsAt = (x) => ((Math.log10(x) - 12) / 4) * 100; // 10^12 .. 10^16 -> 0..100 %
  return `${head(lang, `${c1.title} · ${st['brand.name']}`, '<link rel="stylesheet" href="../story.css">')}
<body class="story">
<canvas id="mol" aria-hidden="true"></canvas>
${bar(lang, st, {}, 'story')}
<main>
  <section class="open" id="c1">
    <div class="open-text">
      <p class="kicker"><b>${esc(st['chapter.label'])} 1</b> / 7</p>
      <h1>${esc(c1.title)}</h1>
      <p class="lead">${esc(c1.kicker)}</p>
    </div>
    <figure class="legend open-legend">
      <figcaption>${esc(c.legendTitle)}</figcaption>
      <ul>${['A', 'C', 'G', 'T'].map((b) => `<li><i style="background:var(--base-${b.toLowerCase()})"></i><b>${b}</b> ${esc(c.legendBases[b])}</li>`).join('')}<li><i style="background:var(--backbone-dna)"></i>${esc(c.backbone)}</li></ul>
      <p class="seq-line"><span class="legend-k">${esc(c.seqLabel)}</span> <span class="seq">${[...SEQ].map((x) => `<span class="${x}">${x}</span>`).join('')}</span></p>
      <p class="src">${esc(st['caption.prefix'])} · ${esc(st['structure.1BNA'])} · <a href="${m.url}">PDB ${m.pdbId}</a> · ${esc(method)} ${res} ${esc(st['caption.res'])} · ${atoms.atoms} ${lang === 'es' ? 'átomos' : 'atoms'} · ${esc(m.citation.firstAuthor.replace(/,.*/, ''))} ${m.citation.year}</p>
      <p class="hint" id="drag-hint">${esc(c.drag)}</p>
    </figure>
  </section>

  <section class="fig" aria-labelledby="f-letters">
    <p class="figure-num" id="f-letters" style="--chars:13">${nf(lang, {}).format(BP)}</p>
    <p class="figure-cap">${esc(c.lettersCap)}<cite>${c.lettersCite}</cite></p>
    <div class="years" role="img" aria-label="${yearsN}">${'<i></i>'.repeat(yearsN)}</div>
    <p class="figure-cap">${c.years(YEARS)}<cite>${c.yearsCite}</cite></p>
  </section>
  ${block('c1.b1')}

  <section class="fig fig-split" aria-labelledby="f-metres">
    <div>
      <p class="figure-num" id="f-metres" style="--chars:5">${num(lang, METRES, 2)}<small>m</small></p>
      <p class="figure-cap">${esc(c.metresCap)}<cite>${c.metresCite}</cite></p>
    </div>
    <svg class="door" viewBox="0 0 120 230" role="img" aria-label="${esc(c.thread)}: ${num(lang, METRES, 2)} m · ${esc(c.door)}: ≈ 2 m">
      <rect x="8" y="30" width="78" height="200" rx="2" fill="none" stroke="var(--ink-3)" stroke-width="1.5"/>
      <circle cx="74" cy="${230 - 100}" r="3" fill="var(--ink-3)"/>
      <line x1="104" y1="230" x2="104" y2="${230 - METRES * 100}" stroke="var(--base-c)" stroke-width="4" stroke-linecap="round"/>
      <text x="47" y="50" text-anchor="middle">${esc(c.door)}</text><text x="47" y="62" text-anchor="middle">≈ 2 m</text>
      <text x="112" y="${230 - METRES * 100 - 8}" text-anchor="end" class="t-c">${num(lang, METRES, 2)} m</text>
    </svg>
  </section>
  ${block('c1.b2')}

  <section class="fig" aria-labelledby="f-cells">
    <p class="figure-num" id="f-cells" style="--chars:${c.cellsWord.length}">${esc(c.cellsWord)}</p>
    <p class="digits">${nf(lang, {}).format(3.0e13)}</p>
    <p class="figure-cap">${esc(c.cellsCap)}<cite>${c.cellsCite}</cite></p>
    <div class="logaxis" role="img" aria-label="10^12 – 10^16">
      <div class="logaxis-band"></div>
      ${[12, 13, 14, 15, 16].map((e) => `<span class="tick" style="left:${(e - 12) * 25}%">10<sup>${e}</sup></span>`).join('')}
      <span class="mark" style="left:${cellsAt(3.0e13)}%"><b>${num(lang, 3.0, 1)}</b> Sender</span>
      <span class="mark mark-2" style="left:${cellsAt(3.72e13)}%"><b>${num(lang, 3.72, 2)}</b> Bianconi</span>
    </div>
    <p class="figure-cap">${c.cellsAxis}</p>
  </section>

  <section class="fig" aria-labelledby="f-coding">
    <p class="figure-num" id="f-coding" style="--chars:6">${num(lang, coding.pointPct, 1)}<small>/ 100</small></p>
    <p class="figure-cap">${esc(c.codingCap)}<cite>${c.codingCite}</cite></p>
    <div class="thousand" role="img" aria-label="${Math.round(coding.pointPct * 10)} / 1000">${Array.from({ length: 1000 }, (_, i) => `<i${i < Math.round(coding.pointPct * 10) ? ' class="on"' : ''}></i>`).join('')}</div>
    <p class="figure-cap">${c.thousand(Math.round(coding.pointPct * 10))}</p>
  </section>
  ${block('c1.b3')}
  ${block('c1.b4')}
  <p class="cta"><a href="./${c.file.viewer}">${esc(c1.cta)} →</a></p>
  <p class="proposal">${esc(c.proposal)}</p>
</main>
<script type="module" src="../story.js"></script>
</body>
</html>
`;
}

// ---- the viewer's cover -----------------------------------------------------------------------
function viewer(lang) {
  const c = COPY[lang];
  const st = read(`web/src/i18n/stage.${lang}.json`);
  const ui = read(`web/src/i18n/${lang}.json`);
  ui.storyLink = lang === 'es' ? 'La historia' : 'The story';
  const v = card.variant;
  const phred = card.avi.phred;
  const topPct = Math.pow(10, -phred / 10) * 100;
  const top = num(lang, topPct, topPct >= 1 ? 0 : 1);
  const feats = [...card.features].filter((f) => f.contribution).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const six = feats.slice(0, 6);
  const restSum = feats.slice(6).reduce((s, f) => s + f.contribution, 0);
  const rows = [...six.map((f) => ({ label: ui[`data.feature.${f.id}`] || f.label, d: f.contribution })), { label: c.rest(feats.length - 6), d: restSum, rest: true }];
  // Waterfall geometry: from the base value, each bar starts where the last ended.
  let run = card.avi.baseValue;
  const pts = rows.map((r) => { const a = run; run += r.d; return { ...r, a, b: run }; });
  const lo = Math.min(card.avi.baseValue, ...pts.map((p) => Math.min(p.a, p.b)), 0);
  const hi = Math.max(card.avi.rawScore, ...pts.map((p) => Math.max(p.a, p.b)));
  const X = (x) => ((x - lo) / (hi - lo)) * 100;
  const sign = (d) => (d >= 0 ? '+' : '−') + num(lang, Math.abs(d), 2);
  const pos = nf(lang, {}).format(v.position);
  return `${head(lang, `${ui['home.title']} · ${st['brand.name']}`, '<link rel="stylesheet" href="../viewer.css">')}
<body class="viewer">
${bar(lang, st, ui, 'viewer')}
<main class="v-main">
  <section class="v-hero">
    <h1>${esc(ui['home.title'])}</h1>
    <p class="lead">${esc(ui['home.lead'])}</p>
  </section>
  <section class="v-card" aria-labelledby="v-id">
    <p class="kicker">${esc(ui['home.hero.kicker'])}</p>
    <p class="v-id" id="v-id">${v.chromosome}:${pos} <span class="seq"><span class="${v.ref}">${v.ref}</span><span class="arrow">→</span><span class="${v.alt}">${v.alt}</span></span></p>
    <p class="v-tags">${esc(v.gene)} · GRCh38 · ${v.rsid ? esc(v.rsid) : (lang === 'es' ? 'sin rsid catalogado' : 'no catalogued rsid')} · <span class="live">Atlas API</span></p>
    <div class="v-score">
      <p class="figure-num" style="--chars:5;--max:7.5rem">${num(lang, phred, 2)}<small>PHRED</small></p>
      <p class="v-top">${esc(c.top(top))}</p>
    </div>
    <div class="gauge" role="img" aria-label="${esc(c.gaugeLabel)}: ${num(lang, phred, 2)}">
      <div class="gauge-track"><div class="gauge-fill" style="width:${(phred / 40) * 100}%"></div></div>
      ${[10, 20, 30, 40].map((p, i) => `<span class="gauge-tick" style="left:${p / 40 * 100}%"><b>${p}</b>${c.gaugeTicks[i]}</span>`).join('')}
      <span class="gauge-mark" style="left:${(phred / 40) * 100}%"></span>
    </div>
    <p class="gauge-cap">${esc(c.gaugeLabel)} · ${esc(ui['card.gauge.formula'])}</p>
    <figure class="fall" aria-label="${esc(ui['home.hero.cascade.caption'])}">
      <figcaption>${esc(ui['home.hero.cascade.caption'])}</figcaption>
      <div class="fall-row fall-base"><span class="fall-label">${esc(c.base)}</span><span class="fall-track"><span class="fall-tick" style="left:${X(card.avi.baseValue)}%"></span></span><span class="fall-num">${num(lang, card.avi.baseValue, 2)}</span></div>
      ${pts.map((p) => `<div class="fall-row${p.rest ? ' fall-rest' : ''}"><span class="fall-label">${esc(p.label)}</span><span class="fall-track"><span class="fall-bar ${p.d >= 0 ? 'up' : 'down'}" style="left:${X(Math.min(p.a, p.b))}%;width:${Math.max(0.6, Math.abs(X(p.b) - X(p.a)))}%"></span></span><span class="fall-num">${sign(p.d)}</span></div>`).join('\n      ')}
      <div class="fall-row fall-total"><span class="fall-label">${esc(c.score)}</span><span class="fall-track"><span class="fall-tick" style="left:${X(card.avi.rawScore)}%"></span></span><span class="fall-num">${num(lang, card.avi.rawScore, 2)}</span></div>
    </figure>
    <p class="v-note">${esc(ui['home.hero.note'])}</p>
    <p class="cta"><a href="#">${esc(ui['home.hero.openCard'])} →</a></p>
  </section>
  <p class="proposal">${esc(c.proposal)}</p>
</main>
</body>
</html>
`;
}

for (const lang of ['es', 'en']) {
  mkdirSync(resolve(HERE, lang), { recursive: true });
  writeFileSync(resolve(HERE, lang, COPY[lang].file.story), story(lang));
  writeFileSync(resolve(HERE, lang, COPY[lang].file.viewer), viewer(lang));
}
console.log('mockup: 4 pages from', ROOT);
