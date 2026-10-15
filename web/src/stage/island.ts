/**
 * The stage island: loaded after the page is interactive, only on the stage pages, never in /app/.
 *
 * Safety net (docs/09-escenario.md): prefers-reduced-motion → no WebGL, posters cross-fade by
 * chapter; no WebGL2, a shader error or a lost context → the same posters. Never a black box.
 * The point budget starts from the device class and is lowered from the measured frame time.
 */
import { loadCloud, loadIndex, type Cloud, type StageIndex } from './cloud';
import { createRenderer, type Renderer } from './renderer';

const START_POINTS_FINE = 20000;
const START_POINTS_COARSE = 12000;
const MIN_POINTS = 4000;
const FRAME_BUDGET_MS = 16.7;
const MORPH_MS = 1700;
const IDLE_CYCLE_MS = 7000;

type Mode = 'webgl' | 'poster';

function ease(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export interface Island {
  mode: Mode;
  show(id: string, opts?: { scaleFrom?: number; scaleTo?: number }): void;
  setScale(id: string, scale: number): void;
}

function setPosterFor(root: HTMLElement, id: string): void {
  // Posters are fetched only in poster mode: a WebGL visitor never downloads them, and the
  // headline, not a full-screen image, stays the largest paint.
  root.querySelectorAll<HTMLImageElement>('.stage-poster').forEach((img) => {
    const on = img.dataset.structure === id;
    if (on && !img.getAttribute('src') && img.dataset.src) img.src = img.dataset.src;
    img.classList.toggle('is-on', on);
  });
}

export function posterIsland(root: HTMLElement, reason: string, firstId?: string): Island {
  document.documentElement.dataset.stageMode = 'poster';
  document.documentElement.dataset.stageReason = reason;
  root.classList.add('is-poster');
  if (firstId) setPosterFor(root, firstId);
  return {
    mode: 'poster',
    show(id) { setPosterFor(root, id); },
    setScale() {},
  };
}

export async function mountIsland(root: HTMLElement, base: string, firstId: string): Promise<Island> {
  const canvas = root.querySelector('canvas');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return posterIsland(root, 'reduced-motion', firstId);
  if (!canvas) return posterIsland(root, 'no-canvas', firstId);
  const forceNoGl = new URLSearchParams(location.search).has('nowebgl');
  const gl = forceNoGl ? null : canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) return posterIsland(root, forceNoGl ? 'forced' : 'no-webgl2', firstId);

  let renderer: Renderer;
  try {
    renderer = createRenderer(canvas, gl);
  } catch (e) {
    console.warn('stage: shader failed, poster instead', e);
    return posterIsland(root, 'shader-error', firstId);
  }

  let index: StageIndex;
  const clouds = new Map<string, Cloud>();
  try {
    index = await loadIndex(base);
    clouds.set(firstId, await loadCloud(base, index.structures.find((s) => s.id === firstId)!.file));
  } catch (e) {
    console.warn('stage: data failed, poster instead', e);
    return posterIsland(root, 'data-error', firstId);
  }
  // The rest of the catalog streams in while the visitor reads, in narrative order.
  const pending = (async () => {
    for (const s of index.structures) {
      if (clouds.has(s.id)) continue;
      await new Promise((r) => ('requestIdleCallback' in window ? requestIdleCallback(() => r(null), { timeout: 800 }) : setTimeout(r, 120)));
      try { clouds.set(s.id, await loadCloud(base, s.file)); } catch (e) { console.warn('stage: cloud', s.id, e); }
    }
  })();

  const params = new URLSearchParams(location.search);
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  let points = Number(params.get('points')) || (coarse ? START_POINTS_COARSE : START_POINTS_FINE);
  // `?still`: a fixed frame for the posters: no adaptation, no cycling, a fixed clock.
  const still = params.has('still');
  const adapt = !params.has('points') && !still;
  renderer.setPoints(points);

  let current = firstId;
  let target = firstId;
  let morphStart = 0;
  let scaleFrom = 1, scaleTo = 1;
  let lastUserMove = performance.now();
  let lost = false;
  let island: Island;

  const first = clouds.get(firstId)!;
  renderer.setPair(first, first);
  renderer.resize();
  root.classList.add('is-live');
  document.documentElement.dataset.stageMode = 'webgl';
  document.documentElement.dataset.stagePoints = String(points);

  canvas.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    lost = true;
    root.classList.remove('is-live');
    island.mode = 'poster';
    posterIsland(root, 'context-lost');
    setPosterFor(root, target);
  });
  window.addEventListener('resize', () => renderer.resize(), { passive: true });
  window.addEventListener('scroll', () => { lastUserMove = performance.now(); }, { passive: true });

  function startMorph(to: string, sFrom = 1, sTo = 1): void {
    const a = clouds.get(current);
    const b = clouds.get(to);
    if (!a || !b || to === target) return;
    renderer.setPair(a, b);
    target = to;
    scaleFrom = sFrom;
    scaleTo = sTo;
    morphStart = performance.now();
  }

  // Frame-time adaptation: median of a window of frames, lowered in steps, never raised back
  // during the visit (a stutter that comes and goes is worse than a steady lower count).
  const samples: number[] = [];
  let lastT = 0;
  let paused = false;
  document.addEventListener('visibilitychange', () => { paused = document.hidden; lastT = 0; });
  const t0 = performance.now();
  function frame(now: number): void {
    if (lost) return;
    requestAnimationFrame(frame);
    if (paused) return;
    if (lastT && adapt) {
      samples.push(now - lastT);
      if (samples.length === 45) {
        const med = [...samples].sort((x, y) => x - y)[22]!;
        samples.length = 0;
        if (med > FRAME_BUDGET_MS * 1.25 && points > MIN_POINTS) {
          points = Math.max(MIN_POINTS, Math.round(points * 0.65));
          renderer.setPoints(points);
          document.documentElement.dataset.stagePoints = String(points);
        }
      }
    }
    lastT = now;
    let t = 1;
    if (target !== current) {
      t = Math.min(1, (now - morphStart) / MORPH_MS);
      if (t >= 1) {
        current = target;
        const c = clouds.get(current)!;
        renderer.setPair(c, c);
        scaleFrom = scaleTo;
      }
    }
    renderer.setState(target !== current ? ease(t) : 0, scaleFrom, target !== current ? scaleTo : scaleFrom);
    const el = still ? 4000 : now - t0;
    const yaw = el * 0.00009 + window.scrollY * 0.0005;
    renderer.setRotation(yaw, 0.32 + 0.08 * Math.sin(el * 0.00013));
    renderer.draw(el / 1000);
  }
  requestAnimationFrame(frame);

  // Idle at the top of the page: the cover cycles through the catalog on its own.
  const cycle = window.setInterval(() => {
    if (document.hidden || lost || still) return;
    const atTop = window.scrollY < window.innerHeight * 0.5;
    if (!atTop || performance.now() - lastUserMove < 2500 || target !== current) return;
    const ids = index.structures.map((s) => s.id).filter((id) => clouds.has(id));
    const next = ids[(ids.indexOf(current) + 1) % ids.length];
    if (next && next !== current) startMorph(next);
  }, IDLE_CYCLE_MS);
  void pending;

  island = {
    mode: 'webgl',
    show(id, opts) {
      // No poster here: a WebGL visitor never downloads them (context loss sets the right one).
      if (!clouds.has(id)) {
        // Not streamed yet: fetch it now, then morph.
        const s = index.structures.find((x) => x.id === id);
        if (s) void loadCloud(base, s.file).then((c) => { clouds.set(id, c); island.show(id, opts); }).catch(() => {});
        return;
      }
      if (id === target) return;
      startMorph(id, opts?.scaleFrom ?? 1, opts?.scaleTo ?? 1);
    },
    setScale(id, scale) {
      // Scale journey: hold one structure and change its on-screen size continuously.
      if (id !== current || target !== current) { island.show(id, { scaleFrom: scale, scaleTo: scale }); return; }
      scaleFrom = scaleTo = scale;
    },
  };
  window.addEventListener('pagehide', () => window.clearInterval(cycle));
  // For the perf lane and the visual checks: what the island ended up doing.
  // bench(n): n frames drawn back to back, each waited for with a 1-pixel readPixels, so the time
  // includes the GPU finishing the frame (rAF intervals only show CPU submission when unthrottled).
  const bench = (n: number): number[] => {
    const px = new Uint8Array(4);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const s0 = performance.now();
      renderer.draw(i / 60);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      out.push(performance.now() - s0);
    }
    return out;
  };
  (window as unknown as { __stage: unknown }).__stage = { stats: () => renderer.stats(), mode: () => island.mode, bench };
  return island;
}
