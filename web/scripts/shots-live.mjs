import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = 'https://darkgray-alpaca-401605.hostingersite.com/';
const V = 'ppp1r1a-pde1b/chr12-54578515-C-T';
mkdirSync('shots-live', { recursive: true });
const b = await chromium.launch();
async function shot(name, hash, theme = 'light', wait = 1500) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: theme });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('agp-tour-seen','1'); } catch {} });
  await p.goto(BASE + hash, { waitUntil: 'networkidle' });
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `shots-live/${name}.png`, fullPage: true });
  console.log(' ', name);
  await ctx.close();
}
await shot('01-portada', '');
await shot('02-ficha', `#/variant/${V}?view=card`);
await shot('03-saturacion', `#/variant/${V}?view=saturation`);
await shot('04-navegador', `#/variant/${V}?view=signal&tracks=RNA_SEQ,DNASE,ATAC`, 'light', 2500);
await shot('05-heatmap-oscuro', `#/variant/${V}?view=tracks`, 'dark');
await b.close();
