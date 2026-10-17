// A2: the opening tour of the viewer (/app/), at 390, 768 and 1440 px, in both languages.
// Asserts the result the visitor gets:
//   - every one of the N cards appears, entirely inside the viewport, once the page is still;
//   - the highlighted element is on screen when its card is;
//   - "Skip" and Escape close the tour from ANY step, and the page is usable afterwards;
//   - once closed it does not come back on reload, and the "How to use it" button brings it back.
//
// Uso: node scripts/serve-subfolder.mjs --run "node scripts/verify-tour.mjs"
import { chromium } from 'playwright';

const BASE = process.env.AGP_BASE_URL || 'http://127.0.0.1:8099/genome-viewer/';
const LANGS = (process.env.AGP_STAGE_LANGS || 'en,es').split(',');
const WIDTHS = [[390, 844], [768, 1024], [1440, 900]];
const SETTLE = 900; // ms: longer than any scroll the tour starts

const browser = await chromium.launch();
let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${label}${detail ? `  ${detail}` : ''}`);
}

async function fresh(lang, w, h) {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + (lang === 'es' ? 'es/app/' : 'app/'), { waitUntil: 'load' });
  await page.waitForSelector('.tour__card', { timeout: 10000 }).catch(() => {});
  return { context, page, errors };
}

const card = (page) => page.evaluate(() => {
  const c = document.querySelector('.tour__card');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const hl = document.querySelector('.tour__highlight');
  const hr = hl && getComputedStyle(hl).display !== 'none' ? hl.getBoundingClientRect() : null;
  const counter = c.querySelector('.tour__counter')?.textContent?.trim() ?? '';
  const [cur, tot] = counter.split('/').map((x) => Number(x.trim()));
  const skip = c.querySelector('.tour__skip')?.getBoundingClientRect();
  return {
    cur, tot, top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: innerWidth, vh: innerHeight,
    hl: hr ? { top: hr.top, bottom: hr.bottom } : null,
    skipIn: !!skip && skip.top >= 0 && skip.bottom <= innerHeight && skip.left >= 0 && skip.right <= innerWidth,
  };
});
const inside = (c) => c.top >= 0 && c.left >= 0 && c.bottom <= c.vh + 0.5 && c.right <= c.vw + 0.5;
const fmt = (c) => `${c.cur}/${c.tot} carta ${Math.round(c.top)}–${Math.round(c.bottom)} de ${c.vh}`;
const next = (page) => page.locator('.tour__actions .button').last().click({ timeout: 3000 });

for (const lang of LANGS) {
  for (const [w, h] of WIDTHS) {
    console.log(`\n=== tour (${lang}, ${w}px) ===`);
    // 1. walk all cards
    const { context, page, errors } = await fresh(lang, w, h);
    const seen = [];
    const bad = [];
    let total = 0;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(SETTLE);
      const c = await card(page);
      if (!c) break;
      total = c.tot;
      seen.push(c.cur);
      if (!inside(c)) bad.push(`carta ${fmt(c)}`);
      if (c.hl && (c.hl.bottom < 0 || c.hl.top > c.vh)) bad.push(`resalte ${c.cur} fuera (${Math.round(c.hl.top)})`);
      if (!c.skipIn) bad.push(`saltar ${c.cur} fuera de pantalla`);
      if (c.cur === c.tot) break;
      try { await next(page); } catch { bad.push(`siguiente ${c.cur} no se pudo pulsar`); break; }
    }
    check(`${lang} ${w}: aparecen las ${total} tarjetas`, total > 0 && seen.length === total && seen.every((n, i) => n === i + 1), seen.join(','));
    check(`${lang} ${w}: cada tarjeta, su resalte y su "saltar" dentro de la pantalla`, bad.length === 0, bad.join(' | '));
    // finishing from the last card closes it
    if (seen.length === total) await next(page).catch(() => {});
    await page.waitForTimeout(300);
    check(`${lang} ${w}: la ultima tarjeta cierra el tour`, !(await page.$('.tour')));
    check(`${lang} ${w}: sin errores de pagina`, errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();

    // 2. skip and Escape from every step
    const stuck = [];
    for (let k = 1; k <= total; k++) {
      for (const how of ['saltar', 'Escape']) {
        const f = await fresh(lang, w, h);
        for (let i = 1; i < k; i++) { await f.page.waitForTimeout(250); await next(f.page).catch(() => {}); }
        await f.page.waitForTimeout(SETTLE);
        try {
          if (how === 'saltar') await f.page.locator('.tour__skip').click({ timeout: 3000 });
          else await f.page.keyboard.press('Escape');
        } catch (e) { stuck.push(`${how}@${k}: ${String(e.message).split('\n')[0].slice(0, 60)}`); }
        await f.page.waitForTimeout(200);
        const open = !!(await f.page.$('.tour'));
        // usable afterwards: the page scrolls and a link takes the click
        const usable = await f.page.evaluate(() => { const y = scrollY; scrollBy({ top: y > 300 ? -200 : 200, behavior: 'instant' }); return scrollY !== y || document.documentElement.scrollHeight <= innerHeight; });
        if (open || !usable) stuck.push(`${how}@${k}: ${open ? 'sigue abierto' : 'la pagina no responde'}`);
        await f.context.close();
      }
    }
    check(`${lang} ${w}: "saltar" y Escape cierran el tour en cada paso`, stuck.length === 0, stuck.join(' | '));
  }

  // 3. remembered, and relaunchable on request
  {
    const { context, page } = await fresh(lang, 1440, 900);
    await page.waitForTimeout(SETTLE);
    await page.keyboard.press('Escape');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1500);
    check(`${lang}: cerrado una vez, no vuelve al recargar`, !(await page.$('.tour')));
    await page.click('#tour-button');
    await page.waitForTimeout(SETTLE);
    const c = await card(page);
    check(`${lang}: el boton "como se usa" lo vuelve a abrir, dentro de la pantalla`, !!c && inside(c), c ? fmt(c) : 'sin tarjeta');
    await context.close();
  }

  // 4. relaunched on a variant page: more steps, elements taller than the screen
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    await context.addInitScript(() => localStorage.setItem('agp-tour-seen', '1'));
    const page = await context.newPage();
    await page.goto(BASE + (lang === 'es' ? 'es/app/' : 'app/') + '#/variant/ppp1r1a-pde1b/chr12-54578515-C-T', { waitUntil: 'load' });
    await page.waitForSelector('.waterfall', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.click('#tour-button');
    const seen = [], bad = [];
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(SETTLE);
      const c = await card(page);
      if (!c) break;
      seen.push(`${c.cur}/${c.tot}`);
      if (!inside(c)) bad.push(fmt(c));
      if (!c.skipIn) bad.push(`saltar ${c.cur} fuera`);
      if (c.cur === c.tot) break;
      await next(page).catch(() => bad.push(`siguiente ${c.cur}`));
    }
    check(`${lang} ${w}: en una ficha de variante, todas las tarjetas dentro de la pantalla`, seen.length > 1 && bad.length === 0, `${seen.join(',')} ${bad.join(' | ')}`);
    await context.close();
  }
}

await browser.close();
console.log(failures === 0 ? '\nverify-tour: TODO OK' : `\nverify-tour: ${failures} FALLAS`);
process.exit(failures === 0 ? 0 : 1);
