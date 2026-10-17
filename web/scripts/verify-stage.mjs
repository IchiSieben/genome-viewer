// Verifies the static "stage" pages (/ and /es/): no external requests, clean console,
// WebGL island vs poster fallbacks, register toggle, reference anchors, caption on scroll.
//
// Uso: node scripts/serve-subfolder.mjs --run "node scripts/verify-stage.mjs"
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AGP_BASE_URL || 'http://127.0.0.1:8099/genome-viewer/';
const OUT = process.argv[2] || 'qa/stage';
mkdirSync(OUT, { recursive: true });
const HOST = new URL(BASE).host;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

let failures = 0;
let warnings = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${label}${detail ? `  ${detail}` : ''}`);
}
function warn(label) {
  warnings++;
  console.log(`  AVISO ${label}`);
}

const probe = await browser.newContext();
const posterStatus = (await probe.request.get(BASE + 'stage/posters/1bna.webp')).status();
await probe.close();
const postersMissing = posterStatus >= 400;
check('stage/posters/1bna.webp existe (node scripts/build-posters.mjs)', !postersMissing, `HTTP ${posterStatus}`);

async function open(lang, { query = '', reducedMotion = 'no-preference', width = 1280, height = 800 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await context.newPage();
  const rec = { errors: [], warnings: [], external: [], bad: [], glCalls: 0, posters: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') rec.errors.push(m.text());
    if (m.type() === 'warning') rec.warnings.push(m.text());
  });
  page.on('pageerror', (e) => rec.errors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return;
    if (u.host !== HOST) rec.external.push(r.url());
    if (u.pathname.includes('/stage/posters/')) rec.posters.push(u.pathname);
  });
  page.on('response', (r) => { if (r.status() >= 400) rec.bad.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(() => {
    window.__glCalls = 0;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (/webgl/i.test(String(type))) window.__glCalls++;
      return orig.call(this, type, ...rest);
    };
  });
  await page.goto(BASE + (lang === 'es' ? 'es/' : '') + query, { waitUntil: 'load', timeout: 120000 });
  return { context, page, rec };
}

// Posters are required: a missing one is a console error and fails like any other.
const notPoster = () => true;

async function posterMode(lang, label, opts) {
  const { context, page, rec } = await open(lang, opts);
  await page.waitForSelector('.stage.is-poster', { timeout: 15000 }).catch(() => {});
  const isPoster = await page.evaluate(() => !!document.querySelector('.stage.is-poster'));
  check(`${lang} ${label}: .stage tiene is-poster`, isPoster);
  const canvasVisible = await page.evaluate(() => {
    const c = document.querySelector('.stage canvas');
    return !!c && Number(getComputedStyle(c).opacity) > 0.05 && c.getBoundingClientRect().width > 0;
  });
  check(`${lang} ${label}: el canvas no se ve (opacity 0)`, !canvasVisible);
  const gl = await page.evaluate(() => window.__glCalls);
  check(`${lang} ${label}: no se creo contexto WebGL`, gl === 0, `getContext(webgl*) x${gl}`);
  if (postersMissing) {
    warn(`${lang} ${label}: sin posters en disco, no se comprueba la imagen visible`);
  } else {
    await page.waitForFunction(() => [...document.querySelectorAll('.stage .stage-poster')].some((i) => i.classList.contains('is-on') && i.complete && i.naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
    const shown = await page.evaluate(() => [...document.querySelectorAll('.stage .stage-poster')].some((i) => {
      const r = i.getBoundingClientRect();
      return i.classList.contains('is-on') && i.naturalWidth > 0 && r.width > 0 && r.height > 0;
    }));
    check(`${lang} ${label}: hay un poster visible`, shown);
  }
  const errs = rec.errors.filter(notPoster);
  check(`${lang} ${label}: sin errores de consola`, errs.length === 0, errs.join(' | ').slice(0, 200));
  await context.close();
}

// AGP_STAGE_LANGS=es runs one language in its own browser (the Mac lane runs them apart: on Metal
// the second language of one browser fell back to the poster, visual4).
for (const lang of (process.env.AGP_STAGE_LANGS || 'en,es').split(',')) {
  console.log(`\n=== escenario (${lang}) ===`);

  // a, b, c: default load
  {
    const { context, page, rec } = await open(lang);
    await page.waitForFunction(() => !!window.__stage, null, { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    check(`${lang}: ninguna peticion a otro host`, rec.external.length === 0, [...new Set(rec.external)].join(' ').slice(0, 200));
    const bad = rec.bad.filter(notPoster);
    check(`${lang}: ninguna respuesta 4xx/5xx`, bad.length === 0, bad.slice(0, 2).join(' | '));
    const errs0 = rec.errors.filter(notPoster);
    check(`${lang}: sin errores de consola ni de pagina`, errs0.length === 0, errs0.join(' | ').slice(0, 300));
    if (rec.warnings.length) console.log(`  info  avisos de consola (${rec.warnings.length}): ${rec.warnings.slice(0, 3).join(' | ').slice(0, 300)}`);
    const st = await page.evaluate(() => ({
      canvas: !!document.querySelector('.stage canvas'),
      poster: !!document.querySelector('.stage.is-poster'),
      stage: !!window.__stage,
      mode: window.__stage?.mode?.(),
    }));
    check(`${lang}: .stage con canvas y sin is-poster`, st.canvas && !st.poster, JSON.stringify(st));
    check(`${lang}: window.__stage existe`, st.stage);

    // g: forbidden text, from the served HTML (scripts/styles/tags stripped)
    const html = await (await page.request.get(page.url())).text();
    const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
    const sim = text.match(/simulaci[oó]n|\bsimulation/i);
    const ph = text.match(/\{[A-Za-z_][\w.-]*\}|\[VERIFICAR\]/);
    check(`${lang}: sin "simulacion/simulation"`, !sim, sim ? sim[0] : '');
    check(`${lang}: sin {placeholder} ni [VERIFICAR]`, !ph, ph ? ph[0] : '');

    // h: reference anchors
    const refs = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a.st-ref')];
      const bad = links.filter((a) => {
        const h = a.getAttribute('href') || '';
        return !/^#ref-\d+$/.test(h) || !document.getElementById(h.slice(1));
      }).map((a) => a.getAttribute('href'));
      return { n: links.length, bad };
    });
    check(`${lang}: ${refs.n} a.st-ref apuntan a un #ref-N existente`, refs.n > 0 && refs.bad.length === 0, refs.bad.slice(0, 3).join(','));

    // i: caption changes while scrolling
    const read = () => page.evaluate(() => document.getElementById('st-caption')?.textContent?.trim() ?? '');
    let last = await read();
    let changes = 0;
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    const step = Math.round(800 * 0.4);
    for (let y = 0; y < total; y += step) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(180);
      const now = await read();
      if (now !== last) { changes++; last = now; }
    }
    check(`${lang}: el pie de estructura cambia al bajar (>=3)`, changes >= 3, `${changes} cambios`);
    // j: each chapter, centred on screen, names its own structure (not only the scale journey).
    const perChapter = [];
    for (const id of await page.evaluate(() => [...document.querySelectorAll('main .st-chapter[data-structure]')].map((s) => s.id))) {
      await page.evaluate((cid) => {
        const el = document.getElementById(cid);
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.3, behavior: 'instant' });
      }, id);
      await page.waitForTimeout(250);
      const want = await page.evaluate((cid) => document.getElementById(cid).dataset.structure, id);
      const got = await read();
      if (!got.includes(want)) perChapter.push(`${id}: quiere ${want}, pie «${got.slice(0, 60)}»`);
    }
    check(`${lang}: cada capitulo centrado muestra su estructura en el pie`, perChapter.length === 0, perChapter.join(' | '));
    const errs1 = rec.errors.filter(notPoster);
    check(`${lang}: sin errores tras el recorrido`, errs1.length === 0, errs1.join(' | ').slice(0, 300));
    check(`${lang}: en modo WebGL no se descarga ningun poster`, rec.posters.length === 0, rec.posters.join(' '));
    await context.close();
  }

  await posterMode(lang, '?nowebgl', { query: '?nowebgl' });
  await posterMode(lang, 'reduced-motion', { reducedMotion: 'reduce' });

  // f: register switch (one, in the header; the full A4 checks are in verify-register.mjs)
  {
    const { context, page } = await open(lang);
    await page.evaluate(() => window.scrollTo(0, 1800));
    await page.waitForTimeout(300);
    await page.locator('.st-switch button[data-set="phd"]').click();
    await page.waitForTimeout(300);
    const reg = await page.evaluate(() => document.documentElement.dataset.register);
    const pressed = await page.evaluate(() => {
      const all = [...document.querySelectorAll('.st-switch button[data-set]')];
      return all.length === 2 && all.every((b) => (b.getAttribute('aria-pressed') === 'true') === (b.dataset.set === 'phd'));
    });
    check(`${lang}: el interruptor phd pone html[data-register]=phd`, reg === 'phd' && pressed, `${reg}`);
    await page.reload({ waitUntil: 'load' });
    const regAfter = await page.evaluate(() => ({ attr: document.documentElement.dataset.register, ls: localStorage.getItem('agp-register') }));
    check(`${lang}: el registro persiste tras recargar`, regAfter.attr === 'phd' && regAfter.ls === 'phd', JSON.stringify(regAfter));
    await context.close();
  }

  // j: screenshots
  for (const [tag, w, h] of [['desktop', 1280, 800], ['mobile', 390, 844]]) {
    const { context, page } = await open(lang, { width: w, height: h });
    await page.waitForFunction(() => !!window.__stage, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/stage-${lang}-${tag}.png` });
    // The full-page capture is evidence, not a check: on Metal (Mac lane, visual3) Chromium refused
    // it ("Unable to capture screenshot", the page is many viewports tall) and took the run down.
    await page.screenshot({ path: `${OUT}/stage-${lang}-${tag}-full.png`, fullPage: true })
      .catch((e) => console.log(`  info  ${lang} ${tag}: sin captura de pagina completa (${String(e.message).split('\n')[0]})`));
    await context.close();
  }
  console.log(`  info  capturas en ${OUT}/`);
}

await browser.close();
if (warnings) console.log(`\n${warnings} avisos`);
console.log(failures === 0 ? '\nverify-stage: TODO OK' : `\nverify-stage: ${failures} FALLAS`);
process.exit(failures === 0 ? 0 : 1);
