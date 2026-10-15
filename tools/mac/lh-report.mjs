// lh-report.mjs <dir> <label> <url> — median of the Lighthouse runs <dir>/<label>-<i>.json.
// Writes docs/evidence/stage/lighthouse-<label>.json and prints one **median** line.
// Exit 1 when no run produced a usable report (e.g. the CDN answered a challenge).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, label, url] = process.argv.slice(2);
const runs = readdirSync(dir)
  .filter((f) => f.startsWith(label + '-') && f.endsWith('.json'))
  .map((f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } })
  .filter((r) => r && r.categories && r.categories.performance && r.categories.performance.score != null);
if (!runs.length) { console.log(`lh-report: ${label}: no usable run`); process.exit(1); }
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const pick = (f) => med(runs.map(f));
const out = {
  url, label, runs: runs.length, finalUrl: runs[0].finalDisplayedUrl || runs[0].finalUrl,
  lighthouse: runs[0].lighthouseVersion, formFactor: runs[0].configSettings?.formFactor,
  performance: Math.round(pick((r) => r.categories.performance.score) * 100),
  accessibility: Math.round(pick((r) => r.categories.accessibility.score) * 100),
  bestPractices: Math.round(pick((r) => r.categories['best-practices'].score) * 100),
  seo: Math.round(pick((r) => r.categories.seo.score) * 100),
  lcpMs: Math.round(pick((r) => r.audits['largest-contentful-paint'].numericValue)),
  cls: +pick((r) => r.audits['cumulative-layout-shift'].numericValue).toFixed(4),
  tbtMs: Math.round(pick((r) => r.audits['total-blocking-time'].numericValue)),
  fcpMs: Math.round(pick((r) => r.audits['first-contentful-paint'].numericValue)),
};
writeFileSync(join(dir, '..', `lighthouse-${label}.json`), JSON.stringify(out, null, 2) + '\n');
console.log(`**median** ${label} (${out.runs} runs, live ${url}): perf ${out.performance} · a11y ${out.accessibility} · bp ${out.bestPractices} · seo ${out.seo} · LCP ${out.lcpMs} ms · CLS ${out.cls} · TBT ${out.tbtMs} ms`);
