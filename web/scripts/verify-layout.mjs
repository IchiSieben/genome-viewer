// A3: layout of the stage (/ and /es/) at 390, 768, 1440, 1920 and 2560 px. Asserts what the
// reader sees:
//   - no horizontal scroll anywhere down the page, and no heading or paragraph outside it;
//   - the fixed header ("Genome Viewer") and the fixed caption hide whatever scrolls under them:
//     their background is opaque, and at every point where text passes beneath, the topmost
//     element is the bar, not the text;
//   - one legend per structure: with a chapter centred, its PDB entry is named once on screen.
//
// Uso: node scripts/serve-subfolder.mjs --run "node scripts/verify-layout.mjs"
import { chromium } from 'playwright';

const BASE = process.env.AGP_BASE_URL || 'http://127.0.0.1:8099/genome-viewer/';
const LANGS = (process.env.AGP_STAGE_LANGS || 'en,es').split(',');
const WIDTHS = [[390, 844], [768, 1024], [1440, 900], [1920, 1080], [2560, 1440]];

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${label}${detail ? `  ${detail}` : ''}`);
}

for (const lang of LANGS) {
  for (const [w, h] of WIDTHS) {
    console.log(`\n=== maquetacion (${lang}, ${w}px) ===`);
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    await page.goto(BASE + (lang === 'es' ? 'es/' : ''), { waitUntil: 'load' });
    await page.waitForTimeout(800);

    const r = await page.evaluate(async () => {
      const out = { sw: 0, cw: document.documentElement.clientWidth, outside: new Set(), bars: {}, under: new Set() };
      const bars = { header: document.querySelector('.st-top'), caption: document.getElementById('st-caption') };
      for (const [k, el] of Object.entries(bars)) {
        if (!el) { out.bars[k] = 'falta'; continue; }
        const cs = getComputedStyle(el);
        const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
        const alpha = m ? (m[1].split(',')[3] === undefined ? 1 : Number(m[1].split(',')[3])) : 0;
        out.bars[k] = alpha === 1 && cs.backgroundImage === 'none' ? 'opaco' : `bg ${cs.backgroundColor} ${cs.backgroundImage.slice(0, 40)}`;
      }
      const texts = [...document.querySelectorAll('main h1, main h2, main p, main li, .st-refs p, .st-refs li')];
      const H = document.documentElement.scrollHeight;
      for (let y = 0; y < H; y += Math.round(innerHeight * 0.37)) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        out.sw = Math.max(out.sw, document.documentElement.scrollWidth);
        for (const t of texts) {
          const q = t.getBoundingClientRect();
          if (q.width === 0 || q.bottom < 0 || q.top > innerHeight) continue;
          if (q.left < -0.5 || q.right > out.cw + 0.5) out.outside.add(`${t.tagName}#${t.id || t.className} ${Math.round(q.left)}..${Math.round(q.right)}`);
          for (const [k, bar] of Object.entries(bars)) {
            if (!bar) continue;
            const b = bar.getBoundingClientRect();
            const top = Math.max(q.top, b.top), bottom = Math.min(q.bottom, b.bottom);
            if (bottom - top < 2) continue;
            const x = Math.min(q.right - 2, Math.max(q.left + 2, 8));
            const y2 = (top + bottom) / 2;
            const hit = document.elementFromPoint(x, y2);
            if (!hit || !bar.contains(hit)) out.under.add(`${k}: ${t.tagName}#${t.id || t.className} a y=${Math.round(y2)} encima ${hit ? hit.tagName : 'nada'}`);
          }
        }
      }
      return { ...out, outside: [...out.outside].slice(0, 4), under: [...out.under].slice(0, 4) };
    });
    check(`${lang} ${w}: sin scroll horizontal`, r.sw <= r.cw, `scrollWidth ${r.sw} / ${r.cw}`);
    check(`${lang} ${w}: ningun titulo ni parrafo fuera de la pagina`, r.outside.length === 0, r.outside.join(' | '));
    check(`${lang} ${w}: el rotulo fijo y el pie son opacos`, r.bars.header === 'opaco' && r.bars.caption === 'opaco', JSON.stringify(r.bars));
    check(`${lang} ${w}: ningun texto se ve por debajo del rotulo ni del pie`, r.under.length === 0, r.under.join(' | '));

    // one legend per structure, chapter by chapter
    const dupes = [];
    for (const id of await page.evaluate(() => [...document.querySelectorAll('main .st-chapter[data-structure]')].map((s) => s.id))) {
      await page.evaluate((cid) => {
        const el = document.getElementById(cid);
        window.scrollTo({ top: el.getBoundingClientRect().bottom + window.scrollY - window.innerHeight * 0.75, behavior: 'instant' });
      }, id);
      await page.waitForTimeout(250);
      const n = await page.evaluate((cid) => {
        const pdb = `PDB ${document.getElementById(cid).dataset.structure}`;
        return [...document.querySelectorAll('body *')].filter((e) => {
          if (e.closest('#refs, .st-foot, template')) return false;
          if (![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.includes(pdb))) return false;
          const q = e.getBoundingClientRect();
          return q.width > 0 && q.bottom > 0 && q.top < innerHeight && getComputedStyle(e).visibility !== 'hidden';
        }).length;
      }, id);
      if (n !== 1) dupes.push(`${id}: ${n}`);
    }
    check(`${lang} ${w}: una sola leyenda por estructura en cada capitulo`, dupes.length === 0, dupes.join(' | '));
    await context.close();
  }
}

await browser.close();
console.log(failures === 0 ? '\nverify-layout: TODO OK' : `\nverify-layout: ${failures} FALLAS`);
process.exit(failures === 0 ? 0 : 1);
