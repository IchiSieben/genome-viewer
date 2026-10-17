// A4: one global reading-level switch on the stage (/ and /es/), at 390 and 1440 px.
// Asserts what the reader gets:
//   - no per-block pills: the blocks carry no buttons;
//   - one switch, fixed, on screen wherever the page is scrolled;
//   - on the first visit, one sentence explains it (exact text per language); once a level is
//     chosen it does not come back, and the choice survives a reload;
//   - one click changes every block at once, and the block being read does not move.
//
// Uso: node scripts/serve-subfolder.mjs --run "node scripts/verify-register.mjs"
import { chromium } from 'playwright';

const BASE = process.env.AGP_BASE_URL || 'http://127.0.0.1:8099/genome-viewer/';
const LANGS = (process.env.AGP_STAGE_LANGS || 'en,es').split(',');
const HINT = {
  es: 'Elige cómo quieres leer: como a los ocho años o como en un doctorado.',
  en: 'Choose how you want to read: as an eight-year-old or as a PhD.',
};

const browser = await chromium.launch();
let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${label}${detail ? `  ${detail}` : ''}`);
}

for (const lang of LANGS) {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    console.log(`\n=== nivel de lectura (${lang}, ${w}px) ===`);
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    await page.goto(BASE + (lang === 'es' ? 'es/' : '') + '?nowebgl', { waitUntil: 'load' });
    await page.waitForTimeout(400);

    const pills = await page.evaluate(() => document.querySelectorAll('main .st-block button, main .st-reg').length);
    check(`${lang} ${w}: los bloques no llevan pildoras`, pills === 0, `${pills} botones en bloques`);

    const sw = await page.evaluate(async () => {
      const all = [...document.querySelectorAll('.st-switch')];
      const out = { n: all.length, fixed: false, onScreen: [], buttons: 0 };
      if (!all[0]) return out;
      const el = all[0];
      out.buttons = el.querySelectorAll('button[data-set]').length;
      let p = el; while (p && p !== document.body) { if (getComputedStyle(p).position === 'fixed') { out.fixed = true; break; } p = p.parentElement; }
      for (const f of [0, 0.25, 0.5, 0.75, 0.98]) {
        window.scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * f, behavior: 'instant' });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const q = el.getBoundingClientRect();
        const cx = q.left + q.width / 2, cy = q.top + q.height / 2;
        const top = document.elementFromPoint(cx, cy);
        out.onScreen.push(q.width > 0 && q.top >= 0 && q.bottom <= innerHeight && q.left >= 0 && q.right <= innerWidth && !!top && el.contains(top));
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
      return out;
    });
    check(`${lang} ${w}: un solo interruptor, fijo, con dos niveles`, sw.n === 1 && sw.fixed && sw.buttons === 2, JSON.stringify({ n: sw.n, fixed: sw.fixed, b: sw.buttons }));
    check(`${lang} ${w}: el interruptor se ve y se puede pulsar a cualquier altura`, sw.onScreen.length === 5 && sw.onScreen.every(Boolean), sw.onScreen.join(','));

    const hint = await page.evaluate(() => {
      const el = document.querySelector('.st-switch-hint');
      if (!el) return null;
      const q = el.getBoundingClientRect();
      return { text: el.textContent.replace(/\s+/g, ' ').trim(), shown: q.width > 0 && q.height > 0 && getComputedStyle(el).visibility !== 'hidden' && q.bottom <= innerHeight };
    });
    check(`${lang} ${w}: la primera vez una frase lo explica`, !!hint && hint.shown && hint.text.includes(HINT[lang]), hint ? `«${hint.text}»` : 'sin frase');

    // every block switches at once, the block being read stays put
    await page.evaluate(() => { const b = document.querySelectorAll('main .st-block')[4]; b.scrollIntoView({ block: 'center', behavior: 'instant' }); });
    await page.waitForTimeout(200);
    const readTop = () => page.evaluate(() => {
      const mid = innerHeight / 2;
      const b = [...document.querySelectorAll('main .st-block')].find((x) => { const q = x.getBoundingClientRect(); return q.top <= mid && q.bottom >= mid; });
      return b ? { id: b.id, top: b.getBoundingClientRect().top } : null;
    });
    const before = await readTop();
    await page.locator('.st-switch button[data-set="phd"]').click();
    await page.waitForTimeout(300);
    const afterTop = await page.evaluate((id) => document.getElementById(id)?.getBoundingClientRect().top, before?.id);
    const state = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('main .st-block')];
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
      return {
        n: blocks.length,
        allPhd: blocks.every((b) => vis(b.querySelector('[data-reg="phd"]')) && !vis(b.querySelector('[data-reg="kid"]'))),
        pressed: document.querySelector('.st-switch button[aria-pressed="true"]')?.dataset.set,
        hint: (() => { const e = document.querySelector('.st-switch-hint'); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; })(),
      };
    });
    check(`${lang} ${w}: un clic cambia los ${state.n} bloques a la vez`, state.n > 10 && state.allPhd && state.pressed === 'phd', JSON.stringify(state));
    check(`${lang} ${w}: el bloque que se lee no se mueve (<4 px)`, !!before && Math.abs(afterTop - before.top) < 4, before ? `${before.id} Δ ${(afterTop - before.top).toFixed(1)} px` : 'ninguno');
    check(`${lang} ${w}: tras elegir, la frase desaparece`, !state.hint);

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    const again = await page.evaluate(() => ({
      reg: document.documentElement.dataset.register,
      hint: (() => { const e = document.querySelector('.st-switch-hint'); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; })(),
    }));
    check(`${lang} ${w}: al recargar recuerda la eleccion y no repite la frase`, again.reg === 'phd' && !again.hint, JSON.stringify(again));
    await context.close();
  }
}

await browser.close();
console.log(failures === 0 ? '\nverify-register: TODO OK' : `\nverify-register: ${failures} FALLAS`);
process.exit(failures === 0 ? 0 : 1);
