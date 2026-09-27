// One HTML shell per language, generated from the built dist/index.html.
//
// Why shells and not one page that switches language in JavaScript: the
// language has to be visible to a crawler (`<html lang>`, hreflang, a title
// and a description per language) and must not cost the visitor a network
// wave. Each shell carries its own <head> and ONLY its language's dictionary,
// inlined. The bundle is shared.
//
//   dist/index.html      English (x-default)
//   dist/es/index.html   Spanish
//   dist/404.html        bilingual, self-contained (served for any depth)
//   dist/sitemap.xml     the two real pages, with their alternates
//   dist/.htaccess       ErrorDocument, cache headers, optional noindex
//
// The views live in the hash (D2), so only the two shells are real pages.
// See docs/07-decisiones-autonomas.md (D-10) for the per-route alternative
// and why it was not taken in this pass.
//
// Build variables (never hardcoded in the source):
//   AGP_SITE     origin of the final site      default https://ichisieben.dev
//   AGP_BASE     mount path, with slashes      default /genome-viewer/
//   AGP_NOINDEX  "1" adds noindex everywhere   default "1" (first upload)
//   AGP_REPO     public repository URL         default https://github.com/IchiSieben/genome-viewer
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '../dist');
const I18N = resolve(here, '../src/i18n');

const SITE = (process.env.AGP_SITE || 'https://ichisieben.dev').replace(/\/$/, '');
let BASE = process.env.AGP_BASE || '/genome-viewer/';
if (!BASE.startsWith('/')) BASE = '/' + BASE;
if (!BASE.endsWith('/')) BASE += '/';
const NOINDEX = (process.env.AGP_NOINDEX ?? '1') === '1';
const REPO = process.env.AGP_REPO || 'https://github.com/IchiSieben/genome-viewer';
const AUTHOR_URL = 'https://ichisieben.dev/';

const LANGS = [
  { lang: 'en', dir: '', root: './', locale: 'en_US' },
  { lang: 'es', dir: 'es/', root: '../', locale: 'es_PE' },
];

const dicts = Object.fromEntries(
  LANGS.map(({ lang }) => [
    lang,
    JSON.parse(readFileSync(resolve(I18N, `${lang}.json`), 'utf8')),
  ]),
);

const template = readFileSync(resolve(DIST, 'index.html'), 'utf8');

// The lazy full-dictionary chunk of each language (Vite names it after the
// JSON file: assets/en-<hash>.js). Its URL goes into the shell so the boot
// script can preload it on the views that need it.
const assetFiles = readdirSync(resolve(DIST, 'assets'));
const fullDict = Object.fromEntries(
  LANGS.map(({ lang }) => [lang, assetFiles.find((f) => new RegExp(`^${lang}-[\\w-]+\\.js$`).test(f))])
    .map(([lang, f]) => [lang, f ? `assets/${f}` : null]),
);

// Namespaces inlined in the shell: what the home page, header, footer, locus
// page and variant card render before the full dictionary arrives. Everything
// else comes in the lazy chunk (src/i18n/index.ts, loadFull). A key missing
// here shows up as a console error, which `npm run verify` fails on.
const INLINE = [
  'brand.', 'meta.', 'skip', 'nav.', 'footer.', 'home.', 'locus.', 'variant.',
  'app.', 'fmt.', 'error.', 'ui.', 'card.', 'legend.', 'data.family.',
  'data.feature.', 'data.note.', 'study.status.', 'notfound.',
  // The comparator's entry link sits on the variant card, an inlined view.
  'compare.link',
  // The signal track browser is one of the four main views: its texts (~1 KB
  // gzipped) are inlined so a deep link to it does not wait for the chunk.
  // Measured: +400 ms on slow 3G when it did.
  'browser.', 'data.modality.',
];
const inlined = (d) =>
  Object.fromEntries(
    Object.entries(d).filter(
      ([k]) =>
        INLINE.some((p) => k === p || k.startsWith(p)) ||
        // Study names are listed on the home page; the rest of each study's
        // prose waits for the full dictionary on the study view.
        /^data\.study\.[^.]+\.label$/.test(k),
    ),
  );

const esc = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const urlOf = (dir) => `${SITE}${BASE}${dir}`;

function jsonLdOf(L) {
  const d = dicts[L.lang];
  const other = LANGS.find((x) => x.lang !== L.lang);
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: d['brand.name'],
    alternateName: dicts[other.lang]['brand.name'],
    description: d['meta.description'],
    url: urlOf(L.dir),
    inLanguage: L.lang,
    applicationCategory: 'ScientificApplication',
    operatingSystem: 'Web browser',
    isAccessibleForFree: true,
    license: 'https://opensource.org/licenses/MIT',
    codeRepository: REPO,
    author: { '@type': 'Person', name: 'Yoichi Palacios (iC7)', url: AUTHOR_URL },
    isBasedOn: {
      '@type': 'SoftwareApplication',
      name: 'AlphaGenome',
      creator: { '@type': 'Organization', name: 'Google DeepMind' },
    },
  };
}

function head(L) {
  const d = dicts[L.lang];
  const other = LANGS.find((x) => x.lang !== L.lang);
  const url = urlOf(L.dir);
  const og = `${SITE}${BASE}og-${L.lang}.png`;
  const lines = [
    `<title>${esc(d['meta.title.home'])}</title>`,
    `<meta name="description" content="${esc(d['meta.description'])}" />`,
    NOINDEX ? `<meta name="robots" content="noindex, nofollow" />` : '',
    `<link rel="canonical" href="${url}" />`,
    ...LANGS.map((x) => `<link rel="alternate" hreflang="${x.lang}" href="${urlOf(x.dir)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${urlOf('')}" />`,
    `<meta name="agp-shell" content="1" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(d['brand.name'])}" />`,
    `<meta property="og:title" content="${esc(d['meta.title.home'])}" />`,
    `<meta property="og:description" content="${esc(d['meta.description'])}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:locale" content="${L.locale}" />`,
    `<meta property="og:locale:alternate" content="${other.locale}" />`,
    `<meta property="og:image" content="${og}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(d['meta.ogAlt'])}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(d['meta.title.home'])}" />`,
    `<meta name="twitter:description" content="${esc(d['meta.description'])}" />`,
    `<meta name="twitter:image" content="${og}" />`,
    fullDict[L.lang] ? `<meta name="agp-full-dict" content="${fullDict[L.lang]}" />` : '',
  ].filter(Boolean);
  return lines.map((l) => `    ${l}`).join('\n');
}

/** Fill `data-i18n` text and `data-i18n-attr` attributes, as `applyStatic` does at runtime. */
function fillStatic(html, d) {
  // Attributes first: they live on the start tag.
  html = html.replace(/<([a-z][a-z0-9]*)\b([^>]*?)\sdata-i18n-attr="([^"]+)"([^>]*)>/gi, (whole, tag, before, spec, after) => {
    let attrs = `${before} data-i18n-attr="${spec}"${after}`;
    for (const pair of spec.split(';')) {
      const [attr, key] = pair.split(':');
      if (!attr || !key) continue;
      if (d[key] === undefined) throw new Error(`build-shells: missing key ${key}`);
      const value = esc(d[key]);
      const re = new RegExp(`\\s${attr}="[^"]*"`);
      attrs = re.test(attrs) ? attrs.replace(re, ` ${attr}="${value}"`) : `${attrs} ${attr}="${value}"`;
    }
    return `<${tag}${attrs}>`;
  });
  // Text: elements whose content is plain text.
  html = html.replace(/(<([a-z][a-z0-9]*)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/gi, (whole, open, tag, key, text, close) => {
    if (d[key] === undefined) throw new Error(`build-shells: missing key ${key}`);
    return `${open}${esc(d[key])}${close}`;
  });
  return html;
}

function shell(L) {
  const d = dicts[L.lang];
  let html = template;
  html = html.replace(/<html lang="[a-z]+"/, `<html lang="${L.lang}"`);
  html = html.replace(
    /<!-- agp:head:start -->[\s\S]*?<!-- agp:head:end -->/,
    `<!-- agp:head:start -->\n${head(L)}\n    <!-- agp:head:end -->`,
  );
  html = html.replace(
    /<meta name="agp-root" content="[^"]*" \/>/,
    `<meta name="agp-root" content="${L.root}" />`,
  );
  const inline = JSON.stringify(inlined(d)).replace(/</g, '\\u003c');
  const ld = JSON.stringify(jsonLdOf(L)).replace(/</g, '\\u003c');
  html = html.replace(
    /<script type="application\/json" id="agp-i18n">[\s\S]*?<\/script>/,
    () =>
      `<script type="application/json" id="agp-i18n">${inline}</script>\n` +
      `    <script type="application/ld+json">${ld}</script>`,
  );
  html = fillStatic(html, d);
  // Static href of the language toggle, for crawlers and no-JS visitors.
  html = html.replace(
    /(id="lang-toggle"[^>]*?\shref=")[^"]*(")/,
    `$1${L.lang === 'en' ? 'es/' : '../'}$2`,
  );
  if (L.root !== './') {
    // Every relative URL in the shell was written for the root. One level down,
    // it needs one more `../`.
    html = html.replace(/(\s(?:src|href)=")\.\/(?!\/)/g, `$1${L.root}`);
  }
  return html;
}

for (const L of LANGS) {
  const out = resolve(DIST, L.dir, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  const html = shell(L);
  writeFileSync(out, html);
  console.log(`build-shells: ${L.dir || '/'}index.html (${L.lang}, ${html.length} B)`);
}

// ---- 404: self-contained, because it is served at any depth ---------------
{
  const en = dicts.en;
  const es = dicts.es;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>404 · ${esc(en['brand.name'])} · ${esc(es['brand.name'])}</title>
<style>
:root{color-scheme:light dark;--bg:#fbfaf7;--ink:#1c1d1f;--muted:#5d6166;--line:#d9d6cf;--link:#1f5fd0}
@media (prefers-color-scheme:dark){:root{--bg:#121416;--ink:#e8e6e1;--muted:#a3a7ad;--line:#2d3136;--link:#8fb4ff}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:40rem;margin:0 auto;padding:12vh 1rem 4rem}
.code{font:600 .8rem/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.08em;color:var(--muted)}
h1{font-size:1.6rem;line-height:1.2;margin:.6rem 0}
p{color:var(--muted);margin:.4rem 0 1rem}
section+section{border-top:1px solid var(--line);margin-top:2rem;padding-top:1.5rem}
a{color:var(--link)}
</style>
</head>
<body>
<main>
<p class="code">404</p>
<section lang="en">
<h1>${esc(en['notfound.title'])}</h1>
<p>${esc(en['notfound.body'])}</p>
<p><a href="${BASE}">${esc(en['notfound.home'])} · ${esc(en['brand.name'])}</a></p>
</section>
<section lang="es">
<h1>${esc(es['notfound.title'])}</h1>
<p>${esc(es['notfound.body'])}</p>
<p><a href="${BASE}es/">${esc(es['notfound.home'])} · ${esc(es['brand.name'])}</a></p>
</section>
</main>
</body>
</html>
`;
  writeFileSync(resolve(DIST, '404.html'), html);
  console.log(`build-shells: 404.html (${html.length} B)`);
}

// ---- sitemap: only real pages ---------------------------------------------
{
  const today = new Date().toISOString().slice(0, 10);
  const alternates = LANGS.map(
    (x) => `    <xhtml:link rel="alternate" hreflang="${x.lang}" href="${urlOf(x.dir)}"/>`,
  ).join('\n');
  const urls = LANGS.map(
    (L) => `  <url>\n    <loc>${urlOf(L.dir)}</loc>\n    <lastmod>${today}</lastmod>\n${alternates}\n  </url>`,
  ).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
  writeFileSync(resolve(DIST, 'sitemap.xml'), xml);
}

// ---- .htaccess (LiteSpeed/Apache on Hostinger honour it per directory) -----
{
  const lines = [
    '# Generated by web/scripts/build-shells.mjs. Do not edit by hand.',
    `ErrorDocument 404 ${BASE}404.html`,
    'Options -Indexes',
    '<IfModule mod_headers.c>',
    NOINDEX
      ? '  # First upload: kept out of search engines until the author gives the OK.\n' +
        '  # Rebuild with AGP_NOINDEX=0 to drop this line and the meta robots tags.\n' +
        '  Header set X-Robots-Tag "noindex, nofollow"'
      : null,
    '  # Hashed bundles never change; shells and data must revalidate.',
    '  <FilesMatch "\\.(js|css)$">',
    '    Header set Cache-Control "public, max-age=31536000, immutable"',
    '  </FilesMatch>',
    '  <FilesMatch "\\.(html|json|bin|xml)$">',
    '    Header set Cache-Control "public, max-age=0, must-revalidate"',
    '  </FilesMatch>',
    '</IfModule>',
    '<IfModule mod_mime.c>',
    '  AddType application/octet-stream .bin',
    '</IfModule>',
  ].filter((l) => l !== null);
  writeFileSync(resolve(DIST, '.htaccess'), lines.join('\n') + '\n');
}

console.log(
  `build-shells: site ${SITE}${BASE} · noindex ${NOINDEX ? 'ON' : 'off'} · repo ${REPO}`,
);
