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
  /** Bring a structure on screen at the given size (1 = fills the stage). */
  show(id: string, opts?: { scaleTo?: number }): void;
  setScale(id: string, scale: number): void;
  /** The cover: let the island cycle through the catalog while nobody scrolls. */
  idle(): void;
  /** The structure on screen, or arriving. */
  shown(): string;
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
  let on = firstId ?? '';
  if (firstId) setPosterFor(root, firstId);
  return {
    mode: 'poster',
    show(id) { on = id; setPosterFor(root, id); },
    setScale() {},
    idle() {},
    shown() { return on; },
  };
}

export async function mountIsland(root: HTMLElement, base: string, firstId: string, onShow: (id: string) => void = () => {}): Promise<Island> {
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

  // What is on screen. `current` is drawn as cloud A; during a morph `target` is cloud B. A change
  // asked for mid-morph waits in `queued` and starts when this one lands: restarting the pair from
  // `current` would snap the half-morphed cloud back (the "reset" A1 measured).
  let current = firstId;
  let target = firstId;
  let queued: string | null = null;
  let queuedWant = 1;
  let morphStart = 0;
  // On-screen size of A and B, and where each is heading. Sizes ease, they never jump: the new
  // structure enters at the size the old one had and grows or shrinks to its own (A1).
  let scaleA = 1, scaleB = 1, wantA = 1, wantB = 1;
  let cycling = false;
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

  function startMorph(to: string, want: number): void {
    const a = clouds.get(current);
    const b = clouds.get(to);
    if (!a || !b) return;
    renderer.setPair(a, b);
    target = to;
    scaleB = scaleA; // enters at the size of what is leaving: no jump
    wantB = want;
    morphStart = performance.now();
    onShow(to);
  }
  function request(id: string, want: number): void {
    if (target !== current) { // mid-morph: the latest request waits, the cloud keeps going
      if (id === target) { wantB = want; queued = null; } else { queued = id; queuedWant = want; }
      return;
    }
    queued = null;
    if (id === current) { wantA = want; return; }
    startMorph(id, want);
  }

  // ---- rotation: one angular velocity, integrated per frame ----------------------------------
  // Idle: a slow, steady turn. Drag: the angle follows the pointer. Release: the drag's velocity
  // carries on and relaxes back to the idle turn. Scroll does not turn it (it used to: yaw had a
  // scrollY term, so every scroll spun or reversed it). dt is capped, so a hidden tab, a long task
  // or a dropped frame never turns into a jump.
  const IDLE_YAW = 0.00009; // rad/ms, about 5 degrees a second
  const PITCH0 = 0.32;
  const RELAX_MS = 1100;
  const DRAG_RAD_PER_PX = 0.008;
  let yaw = 0, pitch = PITCH0;
  let vYaw = IDLE_YAW, vPitch = 0;
  let dragging: { id: number; x: number; y: number; t: number } | null = null;
  // Release velocity: angle over the last ~100 ms of the drag, not per event (pointer events can
  // come 2 ms apart, and one such pair would fling the molecule).
  const trail: Array<{ t: number; yaw: number; pitch: number }> = [];

  // A drag starts on empty space only: over text, links and controls the page behaves as before.
  const TEXTY = 'a, button, input, select, textarea, summary, details, label, p, h1, h2, h3, li, figure, .st-block, .st-top, .st-caption, .st-switch, [role="dialog"]';
  const draggable = (ev: PointerEvent): boolean =>
    ev.isPrimary && (ev.pointerType !== 'mouse' || ev.button === 0) && !(ev.target as Element | null)?.closest?.(TEXTY);
  window.addEventListener('pointerdown', (ev) => {
    if (lost || still || !draggable(ev)) return;
    dragging = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: ev.timeStamp };
    vYaw = 0; vPitch = 0;
    trail.length = 0;
    trail.push({ t: ev.timeStamp, yaw, pitch });
    document.documentElement.classList.add('is-turning');
    if (ev.pointerType === 'mouse') ev.preventDefault(); // no text selection while turning
  });
  window.addEventListener('pointermove', (ev) => {
    if (!dragging) {
      if (ev.pointerType === 'mouse') document.documentElement.classList.toggle('can-turn', ev.buttons === 0 && !lost && draggable(ev));
      return;
    }
    if (ev.pointerId !== dragging.id) return;
    const dx = ev.clientX - dragging.x;
    // Touch: horizontal only (vertical is the page's scroll; the page has touch-action: pan-y).
    const dy = ev.pointerType === 'mouse' ? ev.clientY - dragging.y : 0;
    yaw += dx * DRAG_RAD_PER_PX;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * DRAG_RAD_PER_PX));
    trail.push({ t: ev.timeStamp, yaw, pitch });
    while (trail.length > 2 && ev.timeStamp - trail[1]!.t > 100) trail.shift();
    dragging = { id: dragging.id, x: ev.clientX, y: ev.clientY, t: ev.timeStamp };
  });
  const release = (ev: PointerEvent): void => {
    if (!dragging || ev.pointerId !== dragging.id) return;
    // A pointer that stood still before letting go has no fling left.
    const a = trail[0]!;
    const span = ev.timeStamp - a.t;
    if (ev.timeStamp - dragging.t > 120 || span < 8) { vYaw = 0; vPitch = 0; }
    else { vYaw = (yaw - a.yaw) / span; vPitch = (pitch - a.pitch) / span; }
    const cap = 0.004; // rad/ms: a hard flick still reads as a turn, not a blur
    vYaw = Math.max(-cap, Math.min(cap, vYaw));
    vPitch = Math.max(-cap, Math.min(cap, vPitch));
    dragging = null;
    document.documentElement.classList.remove('is-turning');
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // Frame-time adaptation: median of a window of frames, lowered in steps, never raised back
  // during the visit (a stutter that comes and goes is worse than a steady lower count).
  const samples: number[] = [];
  let lastT = 0;
  let clock = 0; // ms of visible time: the thermal wobble's clock, it does not run while hidden
  let paused = false;
  document.addEventListener('visibilitychange', () => { paused = document.hidden; lastT = 0; });
  let probe = { yaw: 0, pitch: PITCH0, scale: 1, target: firstId, current: firstId };
  function frame(now: number): void {
    if (lost) return;
    requestAnimationFrame(frame);
    if (paused) return;
    const raw = lastT ? now - lastT : 16;
    if (lastT && adapt) {
      samples.push(raw);
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
    const dt = Math.min(raw, 50);
    clock += dt;

    let t = 1;
    if (target !== current) {
      t = Math.min(1, (now - morphStart) / MORPH_MS);
      if (t >= 1) {
        current = target;
        const c = clouds.get(current)!;
        renderer.setPair(c, c);
        scaleA = scaleB;
        wantA = wantB;
        const q = queued;
        queued = null;
        if (q && q !== current) { startMorph(q, queuedWant); t = 0; }
      }
    }
    // Sizes ease toward what is wanted (time constant 220 ms) and never faster than 1.8 per second:
    // continuous whatever the scroll does (leaving the scale journey asks for 0.004 -> 1 at once).
    const k = 1 - Math.exp(-dt / 220);
    const cap = dt * 0.0018;
    const towards = (s: number, w: number): number => s + Math.max(-cap, Math.min(cap, (w - s) * k));
    scaleA = towards(scaleA, wantA);
    scaleB = towards(scaleB, wantB);
    const morphing = target !== current;
    const e = morphing ? ease(t) : 0;
    renderer.setState(e, scaleA, morphing ? scaleB : scaleA);

    if (still) { yaw = 0.36; pitch = PITCH0; }
    else if (!dragging) {
      const r = 1 - Math.exp(-dt / RELAX_MS);
      vYaw += (IDLE_YAW - vYaw) * r;
      vPitch += (0 - vPitch) * r;
      yaw += vYaw * dt;
      pitch += vPitch * dt;
      pitch += (PITCH0 - pitch) * (1 - Math.exp(-dt / 2600)); // drifts back to the resting tilt
    }
    renderer.setRotation(yaw, pitch);
    renderer.draw((still ? 4000 : clock) / 1000);
    probe = { yaw, pitch, scale: morphing ? scaleA + (scaleB - scaleA) * e : scaleA, target, current };
  }
  requestAnimationFrame(frame);

  // Idle at the top of the page: the cover cycles through the catalog on its own, and only there.
  const cycle = window.setInterval(() => {
    if (document.hidden || lost || still || !cycling || dragging || target !== current) return;
    const ids = index.structures.map((s) => s.id).filter((id) => clouds.has(id));
    const next = ids[(ids.indexOf(current) + 1) % ids.length];
    if (next && next !== current) startMorph(next, 1);
  }, IDLE_CYCLE_MS);
  void pending;

  island = {
    mode: 'webgl',
    show(id, opts) {
      cycling = false;
      // No poster here: a WebGL visitor never downloads them (context loss sets the right one).
      if (!clouds.has(id)) {
        // Not streamed yet: fetch it now, then morph.
        const s = index.structures.find((x) => x.id === id);
        if (s) void loadCloud(base, s.file).then((c) => { clouds.set(id, c); island.show(id, opts); }).catch(() => {});
        return;
      }
      request(id, opts?.scaleTo ?? 1);
    },
    setScale(id, scale) {
      // Scale journey: hold one structure and change its on-screen size with the scroll.
      island.show(id, { scaleTo: scale });
    },
    idle() { cycling = true; },
    shown() { return target; },
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
  // motion(): rotation and on-screen size as drawn this frame (scripts/verify-motion.mjs).
  (window as unknown as { __stage: unknown }).__stage = { stats: () => renderer.stats(), mode: () => island.mode, bench, motion: () => ({ ...probe }) };
  return island;
}
