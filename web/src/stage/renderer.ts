/**
 * WebGL2 point renderer for the stage. No library: one program, two vertex buffers.
 *
 * What is drawn is data: each point is a heavy atom at its measured position (PDB), and its
 * jitter amplitude is the RMS thermal displacement from its measured B-factor,
 * u = sqrt(B / 8π²), at the molecule's own scale (gain 1: a 1 Å wobble on a 150 Å molecule is
 * 1/150 of its radius on screen). The morph between two molecules is a visual transition,
 * not a biological process; the pairing (point i ↔ point i) was solved offline.
 *
 * Why not Three.js: ~150 kB gz to draw points; this file is a few kB (docs/09-escenario.md).
 */
import type { Cloud } from './cloud';

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosA;
layout(location=1) in float aAmpA;
layout(location=2) in float aClsA;
layout(location=3) in vec3 aPosB;
layout(location=4) in float aAmpB;
layout(location=5) in float aClsB;
uniform float uT;          // morph 0..1 (eased on the CPU)
uniform float uTime;       // seconds
uniform vec2 uAmpScale;    // Å per amp unit / radius Å, for cloud A and B
uniform vec2 uScale;       // on-screen scale of cloud A and B (1 = fills the stage)
uniform mat3 uRot;
uniform float uAspect;
uniform float uPointPx;
uniform float uDim;        // global opacity (fade in / out)
uniform vec2 uSparse;      // sprite size factor of the real atoms of cloud A and B (>= 1)
out vec3 vColor;
out float vAlpha;

const vec3 C_DNA1 = vec3(0.502, 0.322, 1.000); // #8052ff
const vec3 C_DNA2 = vec3(0.082, 0.518, 0.431); // #15846e
const vec3 C_PROT = vec3(1.000, 0.722, 0.161); // #ffb829
const vec3 C_RNA  = vec3(0.910, 0.894, 0.863); // #e8e4dc
const vec3 C_OTHR = vec3(0.604, 0.604, 0.604); // #9a9a9a

vec3 classColor(float c) {
  c = mod(c, 128.0);
  return c < 0.5 ? C_DNA1 : c < 1.5 ? C_DNA2 : c < 2.5 ? C_PROT : c < 3.5 ? C_RNA : C_OTHR;
}

float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void main() {
  float id = float(gl_VertexID);
  // Isotropic thermal motion: per-axis RMS = u (B = 8π²<u²> is per direction).
  // sqrt(2)·sin has RMS 1, so each axis wobbles with RMS u.
  vec3 ph = vec3(hash(id), hash(id + 0.37), hash(id + 0.71)) * 6.2831853;
  vec3 fr = 0.9 + 0.6 * vec3(hash(id + 1.3), hash(id + 2.1), hash(id + 3.7));
  vec3 wob = 1.4142136 * sin(uTime * fr * 2.2 + ph);
  vec3 pa = aPosA * uScale.x + wob * aAmpA * uAmpScale.x * uScale.x;
  vec3 pb = aPosB * uScale.y + wob * aAmpB * uAmpScale.y * uScale.y;
  vec3 p = uRot * mix(pa, pb, uT);
  float camera = 3.2;
  float w = camera - p.z;
  float f = 2.6;
  gl_Position = vec4(p.x * f / w / uAspect, p.y * f / w, 0.0, 1.0);
  float depth = clamp((p.z + 1.2) / 2.4, 0.0, 1.0);
  bool pad = (uT < 0.5 ? aClsA : aClsB) >= 127.5;
  // A structure with few atoms (1BNA: 486) is padded with repeats; its real atoms get bigger
  // sprites so the molecule reads as a body, not as dust.
  gl_PointSize = max(1.0, uPointPx * (camera / w) * (pad ? 1.0 : mix(uSparse.x, uSparse.y, uT)));
  vColor = mix(classColor(aClsA), classColor(aClsB), smoothstep(0.25, 0.75, uT));
  vAlpha = uDim * (0.22 + 0.78 * depth) * (pad ? 0.12 : 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vColor;
in float vAlpha;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float a = vAlpha * (1.0 - smoothstep(0.35, 1.0, r2));
  outColor = vec4(vColor * a, a); // premultiplied, additive: the black does the work
}`;

export interface RendererStats {
  points: number;
  frameMs: number;
}

export interface Renderer {
  setPair(a: Cloud, b: Cloud): void;
  /** Morph position 0..1 and on-screen scale of each cloud (1 = fills the stage). */
  setState(t: number, scaleA?: number, scaleB?: number): void;
  setRotation(yaw: number, pitch: number): void;
  setPoints(n: number): void;
  setDim(d: number): void;
  draw(timeS: number): void;
  resize(): void;
  stats(): RendererStats;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}

export function createRenderer(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): Renderer {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const loc = {
    t: u('uT'), time: u('uTime'), amp: u('uAmpScale'), scale: u('uScale'), rot: u('uRot'),
    aspect: u('uAspect'), px: u('uPointPx'), dim: u('uDim'), sparse: u('uSparse'),
  };
  const vao = gl.createVertexArray()!;
  const bufA = gl.createBuffer()!;
  const bufB = gl.createBuffer()!;

  function bind(buf: WebGLBuffer, base: number): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(base);
    gl.vertexAttribPointer(base, 3, gl.SHORT, true, 8, 0); // int16 → [-1, 1]
    gl.enableVertexAttribArray(base + 1);
    gl.vertexAttribPointer(base + 1, 1, gl.UNSIGNED_BYTE, false, 8, 6);
    gl.enableVertexAttribArray(base + 2);
    gl.vertexAttribPointer(base + 2, 1, gl.UNSIGNED_BYTE, false, 8, 7);
  }
  gl.bindVertexArray(vao);
  bind(bufA, 0);
  bind(bufB, 3);
  gl.bindVertexArray(null);

  let count = 0;
  let drawN = 0;
  let ampA = 0, ampB = 0;
  let spA = 1, spB = 1;
  // sqrt(points / real atoms), capped: 1 for a dense structure, 3.5 for 1BNA.
  const sparse = (c: Cloud): number => {
    const v = new Uint8Array(c.records);
    let real = 0;
    for (let i = 7; i < v.length; i += 8) if (v[i]! < c.header.padFlag) real++;
    return Math.min(3.5, Math.max(1, Math.sqrt(c.header.points / Math.max(real, 1))));
  };
  let t = 0, sA = 1, sB = 1, dim = 1;
  let yaw = 0, pitch = 0.35;
  let lastFrame = 0, frameMs = 0;

  const rot = new Float32Array(9);
  function rotation(): Float32Array {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // R = Rx(pitch) · Ry(yaw), column-major for WebGL
    rot.set([cy, sp * sy, -cp * sy, 0, cp, sp, sy, -sp * cy, cp * cy]);
    return rot;
  }

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  return {
    setPair(a, b) {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufA);
      gl.bufferData(gl.ARRAY_BUFFER, a.records, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufB);
      gl.bufferData(gl.ARRAY_BUFFER, b.records, gl.STATIC_DRAW);
      count = Math.min(a.header.points, b.header.points);
      drawN = drawN ? Math.min(drawN, count) : count;
      ampA = a.header.ampStepA / a.header.radiusA;
      ampB = b.header.ampStepA / b.header.radiusA;
      spA = sparse(a);
      spB = a === b ? spA : sparse(b);
    },
    setState(nt, a = 1, b = 1) { t = nt; sA = a; sB = b; },
    setRotation(y, p) { yaw = y; pitch = p; },
    setPoints(n) { drawN = Math.max(1, Math.min(n, count || n)); },
    setDim(d) { dim = d; },
    resize,
    draw(timeS) {
      const now = performance.now();
      if (lastFrame) frameMs = frameMs ? frameMs * 0.9 + (now - lastFrame) * 0.1 : now - lastFrame;
      lastFrame = now;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!count) return;
      gl.useProgram(prog);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.disable(gl.DEPTH_TEST);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Fewer points get slightly larger sprites so the molecule keeps its body.
      const px = dpr * Math.max(1.6, Math.min(3.2, 2.2 * Math.sqrt(20000 / Math.max(drawN, 1)) * (canvas.clientHeight / 900)));
      gl.uniform1f(loc.t, t);
      gl.uniform1f(loc.time, timeS);
      gl.uniform2f(loc.amp, ampA, ampB);
      gl.uniform2f(loc.scale, sA, sB);
      gl.uniformMatrix3fv(loc.rot, false, rotation());
      gl.uniform1f(loc.aspect, canvas.width / canvas.height);
      gl.uniform1f(loc.px, px);
      gl.uniform1f(loc.dim, dim);
      gl.uniform2f(loc.sparse, spA, spB);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.POINTS, 0, drawN);
      gl.bindVertexArray(null);
    },
    stats() { return { points: drawN, frameMs }; },
    dispose() {
      gl.deleteBuffer(bufA);
      gl.deleteBuffer(bufB);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    },
  };
}
