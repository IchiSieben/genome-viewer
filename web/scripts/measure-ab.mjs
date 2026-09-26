// Before/after measurement that survives a busy machine.
//
// Measuring "before" at 10:00 and "after" at 14:00 compares two machine loads,
// not two builds: on 2026-09-26 the same build varied by more than a second
// on slow 3G between runs while other work saturated the CPU. Here both builds
// are served at the same time on two ports and measured in alternation
// (A, B, A, B...), so any drift hits both equally. The report is the median
// per view and the per-round difference.
//
// Usage:
//   node scripts/measure-ab.mjs <baseline-dist-dir> [rounds=3]
// Output: docs/evidence/performance-ab.json and a table on stdout.
// Env: AGP_AB_LANG=es measures the Spanish shell (<mount>/es/) instead of the
// English root; AGP_AB_OUT names the output file (default performance-ab.json).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const baseline = process.argv[2];
const rounds = Number(process.argv[3] || 3);
const LANG_DIR = process.env.AGP_AB_LANG === 'es' ? 'es/' : '';
if (!baseline) {
  console.error('usage: node scripts/measure-ab.mjs <baseline-dist-dir> [rounds]');
  process.exit(1);
}

const builds = [
  { name: 'antes', dist: resolve(baseline), port: 8097 },
  { name: 'despues', dist: resolve(here, '../dist'), port: 8098 },
];

function serve(b) {
  const child = spawn(process.execPath, [resolve(here, 'serve-subfolder.mjs')], {
    env: { ...process.env, AGP_DIST: b.dist, AGP_PORT: String(b.port) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((ok) => {
    child.stdout.once('data', () => ok(child));
  });
}

function run(cmd, args, env) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`${args.join(' ')} -> ${code}`))));
  });
}

const servers = [];
for (const b of builds) servers.push(await serve(b));

const scratch = resolve(tmpdir(), 'agp-measure-ab');
mkdirSync(scratch, { recursive: true });
const results = Object.fromEntries(builds.map((b) => [b.name, []]));

try {
  for (let r = 0; r < rounds; r++) {
    for (const b of r % 2 ? [...builds].reverse() : builds) {
      const out = resolve(scratch, `${b.name}-${r}.json`);
      await run(process.execPath, [resolve(here, 'measure.mjs')], {
        AGP_BASE_URL: `http://127.0.0.1:${b.port}/genome-viewer/${LANG_DIR}`,
        AGP_MEASURE_OUT: out,
      });
      results[b.name].push(JSON.parse(readFileSync(out, 'utf8')));
      console.log(`ronda ${r + 1}/${rounds}: ${b.name} medido`);
    }
  }
} finally {
  for (const s of servers) s.kill();
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const views = Object.keys(results.antes[0].runs).filter((k) => k !== 'interaction');
const table = views.map((v) => {
  const pick = (name, f) => results[name].map((x) => f(x.runs[v]));
  return {
    view: v,
    antesMs: median(pick('antes', (r) => r.ms)),
    despuesMs: median(pick('despues', (r) => r.ms)),
    antesKiB: median(pick('antes', (r) => r.transferredBytes)) / 1024,
    despuesKiB: median(pick('despues', (r) => r.transferredBytes)) / 1024,
    antesOleadas: median(pick('antes', (r) => r.waves.depth)),
    despuesOleadas: median(pick('despues', (r) => r.waves.depth)),
    antesCls: Math.max(...pick('antes', (r) => r.cls ?? 0)),
    despuesCls: Math.max(...pick('despues', (r) => r.cls ?? 0)),
  };
});

const out = resolve(here, '../../docs/evidence', process.env.AGP_AB_OUT || 'performance-ab.json');
writeFileSync(
  out,
  JSON.stringify({ measuredAt: new Date().toISOString(), rounds, lang: LANG_DIR ? 'es' : 'en', baseline, table }, null, 2) + '\n',
);

console.log('\nvista              antes ms  despues ms   antes KiB  despues KiB  oleadas  CLS (max)');
for (const t of table) {
  console.log(
    `${t.view.padEnd(18)}${String(Math.round(t.antesMs)).padStart(9)}${String(Math.round(t.despuesMs)).padStart(12)}` +
      `${t.antesKiB.toFixed(1).padStart(12)}${t.despuesKiB.toFixed(1).padStart(13)}` +
      `${`${t.antesOleadas}->${t.despuesOleadas}`.padStart(9)}  ${t.antesCls.toFixed(4)}->${t.despuesCls.toFixed(4)}`,
  );
}
console.log(`\nEscrito en ${out}`);
