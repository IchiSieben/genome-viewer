// A1: the molecule's motion, measured. A recorder inside the page samples the island's rotation
// and on-screen size every 100 ms. Each sample carries the time of the FRAME that drew it
// (motion().t), and samples of the same frame are dropped: at a low frame rate, wall-clock
// sampling read "no change" between frames as a freeze and two frames' motion as one jump (the
// Mac lane, 2026-10-17). The checks assert what the reader sees, not a symptom:
//   rest     10 s untouched: the angle always advances (no two equal samples in a row), one way,
//            and never faster than MAX_RATE;
//   drag     a mouse drag over empty space turns it the way the mouse went; on release it keeps
//            turning that way (inertia), never faster than the hand moved it, and settles back to
//            the idle turn;
//   chapters two chapter changes by scroll: angle and on-screen size stay continuous (the new
//            structure enters in the same orientation and scale) and scroll does not turn it;
//   scale    leaving the scale journey, the size grows back without a snap;
//   5 fps    the same drag with requestAnimationFrame held to 5 frames per second: after release
//            the turn still settles back to the idle turn within 5 s (relaxation runs on real time).
//
// Uso: node scripts/serve-subfolder.mjs --run "node scripts/verify-motion.mjs"
import { chromium } from 'playwright';

const BASE = process.env.AGP_BASE_URL || 'http://127.0.0.1:8099/genome-viewer/';
const LANGS = (process.env.AGP_STAGE_LANGS || 'en,es').split(',');
const ANGLE = process.env.AGP_ANGLE || 'swiftshader';
const MAX_RATE = 1.2; // rad/s outside a drag: idle is 0.09; the old scroll term reached 8.6
const MAX_SCALE_RATE = 2.5; // on-screen size per second (1 = fills the stage); the old snap was ~10

const browser = await chromium.launch({
  // AGP_ANGLE=metal on the Mac lane: the node's GPU, not a CPU rasterizer (SwiftShader ran the Mac at ~5 fps).
  args: [`--use-angle=${ANGLE}`, ...(ANGLE === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : ['--enable-gpu']), '--ignore-gpu-blocklist', '--enable-webgl'],
});
let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${label}${detail ? `  ${detail}` : ''}`);
}

// In-page recorder: start, then read back what was recorded since.
const startRec = (page) => page.evaluate(() => {
  window.__rec = [];
  clearInterval(window.__recId);
  window.__recId = setInterval(() => {
    const m = window.__stage.motion();
    if (window.__rec.at(-1)?.t !== m.t) window.__rec.push(m); // one sample per drawn frame
  }, 100);
});
const stopRec = (page) => page.evaluate(() => { clearInterval(window.__recId); return window.__rec; });
const fps = (xs) => xs.length > 1 ? (xs.length - 1) / ((xs.at(-1).t - xs[0].t) / 1000) : 0;

// Per-sample rates: d/dt of a key, per second.
function rates(xs, key) {
  const out = [];
  for (let i = 1; i < xs.length; i++) {
    const dt = (xs[i].t - xs[i - 1].t) / 1000;
    out.push({ d: xs[i][key] - xs[i - 1][key], r: (xs[i][key] - xs[i - 1][key]) / dt, dt });
  }
  return out;
}
const fmt = (x) => x.toFixed(3);
const maxAbs = (xs) => Math.max(...xs.map((x) => Math.abs(x.r)));

for (const lang of LANGS) {
  console.log(`\n=== movimiento (${lang}) ===`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + (lang === 'es' ? 'es/' : ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stage?.mode?.() === 'webgl' && !!window.__stage.motion, null, { timeout: 20000 })
    .catch(() => {});
  const has = await page.evaluate(() => window.__stage?.motion?.() ?? null);
  check(`${lang}: la isla expone su movimiento (__stage.motion)`, !!has, JSON.stringify(has));
  if (!has) { await context.close(); continue; }

  // Start inside chapter 1 (no cycling of the cover: one fixed structure).
  await page.evaluate(() => window.scrollTo({ top: document.getElementById('c1').offsetTop, behavior: 'instant' }));
  await page.waitForTimeout(2500);

  // ---- rest ----
  await startRec(page);
  await page.waitForTimeout(10000);
  const restRec = await stopRec(page);
  const rest = rates(restRec, 'yaw');
  const frozen = rest.filter((x) => x.d === 0).length;
  const idle = rest.map((x) => x.r).sort((a, b) => a - b)[Math.floor(rest.length / 2)];
  check(`${lang} reposo: ${rest.length + 1} muestras, ninguna igual a la anterior`, frozen === 0, `${frozen} repetidas`);
  check(`${lang} reposo: gira en un solo sentido, sin saltos (< ${MAX_RATE} rad/s)`, rest.every((x) => x.r > 0) && maxAbs(rest) < MAX_RATE,
    `mediana ${fmt(idle)} rad/s, max ${fmt(maxAbs(rest))}, ${fps(restRec).toFixed(0)} fps muestreados`);

  // ---- drag over empty space right of the text column ----
  const x0 = 900, y0 = 450;
  const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName}.${el.className}` : 'none'; }, [x0, y0]);
  await startRec(page);
  await page.waitForTimeout(300);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  const marks = await page.evaluate(() => performance.now());
  for (let i = 1; i <= 12; i++) { await page.mouse.move(x0 - 18 * i, y0, { steps: 3 }); await page.waitForTimeout(90); }
  // Let go while moving, as a hand does: the last move and the release in the same breath.
  await Promise.all([page.mouse.move(x0 - 18 * 13, y0), page.mouse.up()]);
  const upAt = await page.evaluate(() => performance.now());
  await page.waitForTimeout(5000);
  const rec = await stopRec(page);
  const during = rates(rec.filter((s) => s.t >= marks && s.t <= upAt), 'yaw');
  const afterS = rec.filter((s) => s.t > upAt);
  const after = rates(afterS, 'yaw');
  const turned = (rec.filter((s) => s.t <= upAt).at(-1)?.yaw ?? 0) - (rec.filter((s) => s.t < marks).at(-1)?.yaw ?? 0);
  const handRate = maxAbs(during);
  check(`${lang} arrastre: arrastrar a la izquierda la gira a la izquierda`, turned < -0.3, `Δ ${fmt(turned)} rad (punto ${hit})`);
  check(`${lang} arrastre: al soltar sigue en el sentido del arrastre (inercia)`, (after[0]?.r ?? 0) < 0, `primera velocidad ${fmt(after[0]?.r ?? 0)} rad/s`);
  check(`${lang} arrastre: al soltar nunca va mas rapido que la mano`, maxAbs(after) <= Math.max(handRate * 1.2, MAX_RATE), `max ${fmt(maxAbs(after))} rad/s, mano ${fmt(handRate)}`);
  const tail = after.slice(-10);
  check(`${lang} arrastre: retoma el giro de reposo`, tail.every((x) => x.r > 0 && Math.abs(x.r - idle) < idle * 0.6), tail.map((x) => fmt(x.r)).join(','));
  check(`${lang} arrastre: no selecciona texto`, await page.evaluate(() => String(getSelection()).trim() === ''));

  // ---- two chapter changes by scroll ----
  const tops = await page.evaluate(() => ['c2', 'c3'].map((id) => document.getElementById(id).offsetTop));
  await startRec(page);
  await page.waitForTimeout(300);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), tops[0]);
  await page.waitForTimeout(2700);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), tops[1]);
  await page.waitForTimeout(3500);
  const chapRec = await stopRec(page);
  const cy = rates(chapRec, 'yaw');
  const cs = rates(chapRec, 'scale');
  const targets = [...new Set(chapRec.map((m) => m.target))];
  check(`${lang} capitulos: cambia de estructura dos veces`, targets.length >= 3, targets.join(' → '));
  check(`${lang} capitulos: el angulo sigue igual, sin saltos ni giro por el scroll`, cy.every((x) => x.r > 0 && Math.abs(x.r - idle) < idle * 0.6),
    `min ${fmt(Math.min(...cy.map((x) => x.r)))}, max ${fmt(Math.max(...cy.map((x) => x.r)))} rad/s`);
  check(`${lang} capitulos: sin saltos de tamaño`, maxAbs(cs) <= MAX_SCALE_RATE, `max ${fmt(maxAbs(cs))}/s`);

  // ---- back out of the scale journey ----
  const deep = await page.evaluate(() => { const s = document.getElementById('scale'); return s.offsetTop + s.offsetHeight * 0.6; });
  const c7 = await page.evaluate(() => document.getElementById('c7').offsetTop);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), deep);
  await page.waitForTimeout(3000);
  await startRec(page);
  await page.waitForTimeout(300);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), c7);
  await page.waitForTimeout(4000);
  const back = await stopRec(page);
  const bs = rates(back, 'scale');
  check(`${lang} escala: al volver del viaje de escalas el tamaño crece sin salto`, maxAbs(bs) <= MAX_SCALE_RATE,
    `max ${fmt(maxAbs(bs))}/s; ${fmt(back[0].scale)} → ${fmt(back.at(-1).scale)}`);
  check(`${lang} escala: termina a tamaño de capitulo`, Math.abs(back.at(-1).scale - 1) < 0.05, fmt(back.at(-1).scale));

  check(`${lang}: sin errores de pagina`, errors.length === 0, errors.join(' | ').slice(0, 200));
  await context.close();

  // ---- the same drag at 5 frames per second ----
  const slow = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await slow.addInitScript(() => { window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 200); });
  const sp = await slow.newPage();
  await sp.goto(BASE + (lang === 'es' ? 'es/' : ''), { waitUntil: 'load' });
  await sp.waitForFunction(() => window.__stage?.mode?.() === 'webgl' && !!window.__stage.motion, null, { timeout: 20000 }).catch(() => {});
  await sp.evaluate(() => window.scrollTo({ top: document.getElementById('c1').offsetTop, behavior: 'instant' }));
  await sp.waitForTimeout(2500);
  await startRec(sp);
  await sp.waitForTimeout(4000);
  const sRest = await stopRec(sp);
  const sIdle = rates(sRest, 'yaw').map((x) => x.r).sort((a, b) => a - b)[Math.floor(sRest.length / 2)] ?? 0;
  await sp.mouse.move(x0, y0);
  await sp.mouse.down();
  for (let i = 1; i <= 12; i++) { await sp.mouse.move(x0 - 18 * i, y0, { steps: 2 }); await sp.waitForTimeout(90); }
  await Promise.all([sp.mouse.move(x0 - 18 * 13, y0), sp.mouse.up()]);
  const sUp = await sp.evaluate(() => performance.now());
  await startRec(sp);
  await sp.waitForTimeout(6500);
  const sAfter = (await stopRec(sp)).filter((m) => m.t > sUp + 5000);
  const sTail = rates(sAfter, 'yaw');
  check(`${lang} 5 fps: el giro de reposo sigue avanzando (${fps(sRest).toFixed(1)} fps)`, sIdle > 0 && rates(sRest, 'yaw').every((x) => x.r > 0), `mediana ${fmt(sIdle)} rad/s`);
  check(`${lang} 5 fps: 5 s despues de soltar ya volvio al giro de reposo`, sTail.length > 2 && sTail.every((x) => x.r > 0 && Math.abs(x.r - sIdle) < sIdle * 0.6),
    sTail.map((x) => fmt(x.r)).join(','));
  await slow.close();
}

await browser.close();
console.log(failures === 0 ? '\nverify-motion: TODO OK' : `\nverify-motion: ${failures} FALLAS`);
process.exit(failures === 0 ? 0 : 1);
