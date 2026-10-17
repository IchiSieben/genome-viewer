// Molecule renderer for the identity mockup (phase B). WebGL2, no library.
//
// Every heavy atom of the PDB entry is a sphere: one instanced quad per atom, the fragment shader
// intersects the view ray with the sphere and writes the true depth, so atoms occlude each other
// like a space-filling model. Colour is meaning, not decoration (codes from tools/atoms.py):
//   0 A, 1 C, 2 G, 3 T, 4 U (base atoms) · 5 DNA backbone · 6 RNA backbone · 7 protein (by chain)
//   8 other (ligands, ions).
// Motion follows the A1 rules: one angular velocity, idle turn, drag with inertia, dt capped.

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;           // quad corner, -1..1
layout(location=1) in vec3 aPos;              // int16 normalised -> -1..1 (radius 1)
layout(location=2) in vec2 aCode;             // code, chain (u8)
uniform mat3 uRot;
uniform float uAspect, uZoom, uAtomR, uAppear, uOffsetX, uOffsetY, uUpZ;
uniform vec3 uPal[9];
uniform vec3 uChains[8];
uniform float uFocus;                          // -1 none, else the code (or 10 = all bases) in focus
out vec2 vCorner;
out vec3 vColor;
out float vDepth;
out float vR;
void main() {
  // uUpZ: the entry's long axis is z (1BNA's helix): stand it upright, so the idle turn spins the
  // helix about its own axis.
  vec3 p = uRot * (uUpZ > 0.5 ? vec3(aPos.x, aPos.z, -aPos.y) : aPos);
  float code = aCode.x;
  vec3 c = code > 6.5 && code < 7.5 ? uChains[int(mod(aCode.y, 8.0))] : uPal[int(code)];
  float dim = 1.0;
  if (uFocus >= 0.0) {
    bool on = uFocus > 9.5 ? code < 4.5 : abs(code - uFocus) < 0.5;
    dim = on ? 1.0 : 0.28;
  }
  vColor = c * dim;
  // Entrance: atoms arrive from slightly further out, ordered by radius (centre first).
  float r = length(aPos);
  float k = clamp((uAppear * 1.6 - r * 0.6), 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);
  p *= mix(1.35, 1.0, k);
  float camera = 3.0;
  float w = camera - p.z;
  float f = 2.5 * uZoom;
  float rad = uAtomR * k;
  vec2 ndc = vec2(p.x * f / w / uAspect + uOffsetX, p.y * f / w + uOffsetY);
  vec2 off = aCorner * rad * f / w;
  gl_Position = vec4(ndc + vec2(off.x / uAspect, off.y), 0.5 - p.z * 0.2, 1.0);
  vCorner = aCorner;
  vDepth = p.z;
  vR = rad;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vCorner;
in vec3 vColor;
in float vDepth;
in float vR;
uniform float uFog;
out vec4 o;
void main() {
  float d2 = dot(vCorner, vCorner);
  if (d2 > 1.0) discard;
  float z = sqrt(1.0 - d2);
  vec3 n = vec3(vCorner, z);
  vec3 L = normalize(vec3(-0.45, 0.6, 0.66));
  float diff = max(dot(n, L), 0.0);
  float rim = pow(1.0 - z, 2.0);
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
  // depth cue: atoms at the back fade into the background a little
  float cue = mix(0.55, 1.0, clamp((vDepth + 1.0) / 2.0, 0.0, 1.0));
  vec3 col = vColor * (0.32 + 0.78 * diff) * cue + spec * 0.22 - rim * 0.12;
  o = vec4(mix(vec3(uFog), col, 1.0), 1.0);
  gl_FragDepth = gl_FragCoord.z - z * vR * 0.08;
}`;

function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }

export async function mountMolecule(canvas, url, opts = {}) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) throw new Error('no webgl2');
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const U = (n) => gl.getUniformLocation(prog, n);

  const [head, bin] = await Promise.all([fetch(url + '.json').then((r) => r.json()), fetch(url + '.bin').then((r) => r.arrayBuffer())]);
  const n = head.atoms;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, bin, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.SHORT, true, 8, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.UNSIGNED_BYTE, false, 8, 6);
  gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);

  const css = getComputedStyle(document.documentElement);
  const v = (k, d) => (css.getPropertyValue(k).trim() || d);
  const pal = [v('--base-a', '#00b386'), v('--base-c', '#4fa8ff'), v('--base-g', '#f2b705'), v('--base-t', '#ff5a36'), v('--base-u', '#d67ad1'),
    v('--backbone-dna', '#c9cdd6'), v('--backbone-rna', '#9fa5b3'), '#888888', v('--other', '#6b7280')].map(hex).flat();
  const chains = ['--chain-1', '--chain-2', '--chain-3', '--chain-4', '--chain-5', '--chain-6', '--chain-7', '--chain-8']
    .map((k, i) => v(k, ['#9aa7ff', '#7fd6c2', '#f0a6ca', '#c7b8ff', '#ffd08a', '#8fd0ff', '#b9e48a', '#ffb3a1'][i])).map(hex).flat();
  const fog = hex(v('--bg', '#0b0d12'));

  // Atom radius in normalised units: a heavy atom ~1.6 A (space-filling), over the molecule radius.
  const atomR = (opts.atomA ?? 1.6) / head.radiusA;
  let yaw = opts.yaw ?? 0.6, pitch = opts.pitch ?? 0.25, vYaw = 0.00012, vPitch = 0;
  const IDLE = opts.reduced ? 0 : 0.00012;
  let dragging = null; const trail = [];
  let zoom = opts.zoom ?? 1, focus = -1, offsetX = opts.offsetX ?? 0, offsetY = opts.offsetY ?? 0;
  const t0 = performance.now();
  let last = 0, frames = 0, cost = [];
  const rot = new Float32Array(9);

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  }
  addEventListener('resize', resize);
  resize();

  const target = opts.dragTarget || canvas;
  target.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('a, button, p, h1, h2, h3, li, .no-drag')) return;
    dragging = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
    trail.length = 0; trail.push({ t: e.timeStamp, yaw, pitch });
    document.documentElement.classList.add('is-turning');
    if (e.pointerType === 'mouse') e.preventDefault();
  });
  addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    yaw += (e.clientX - dragging.x) * 0.008;
    if (e.pointerType === 'mouse') pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - dragging.y) * 0.008));
    dragging = { ...dragging, x: e.clientX, y: e.clientY, t: e.timeStamp };
    trail.push({ t: e.timeStamp, yaw, pitch });
    while (trail.length > 2 && e.timeStamp - trail[1].t > 100) trail.shift();
  });
  const up = (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const a = trail[0], span = e.timeStamp - a.t;
    if (e.timeStamp - dragging.t > 120 || span < 8) { vYaw = 0; vPitch = 0; } else { vYaw = (yaw - a.yaw) / span; vPitch = (pitch - a.pitch) / span; }
    vYaw = Math.max(-0.004, Math.min(0.004, vYaw)); vPitch = Math.max(-0.004, Math.min(0.004, vPitch));
    dragging = null;
    document.documentElement.classList.remove('is-turning');
  };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min(now - last, 50) : 16;
    last = now;
    if (!dragging) {
      const r = 1 - Math.exp(-dt / 1100);
      vYaw += (IDLE - vYaw) * r; vPitch += (0 - vPitch) * r;
      yaw += vYaw * dt; pitch += vPitch * dt;
      pitch += ((opts.pitch ?? 0.25) - pitch) * (1 - Math.exp(-dt / 2600));
    }
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    rot.set([cy, sp * sy, -cp * sy, 0, cp, sp, sy, -sp * cy, cp * cy]);
    const s0 = performance.now();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(prog);
    gl.uniformMatrix3fv(U('uRot'), false, rot);
    gl.uniform1f(U('uAspect'), canvas.width / canvas.height);
    gl.uniform1f(U('uZoom'), zoom);
    gl.uniform1f(U('uAtomR'), atomR);
    gl.uniform1f(U('uAppear'), opts.reduced ? 1 : Math.min(1, (now - t0) / 1600));
    gl.uniform1f(U('uOffsetX'), offsetX);
    gl.uniform1f(U('uOffsetY'), offsetY);
    gl.uniform1f(U('uUpZ'), opts.upZ ? 1 : 0);
    gl.uniform1f(U('uFocus'), focus);
    gl.uniform1f(U('uFog'), fog[0]);
    gl.uniform3fv(U('uPal[0]'), pal);
    gl.uniform3fv(U('uChains[0]'), chains);
    gl.bindVertexArray(vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindVertexArray(null);
    frames++;
  }
  requestAnimationFrame(frame);

  // bench(k): k frames drawn back to back, each waited for with readPixels (GPU done), in ms.
  const bench = (k) => {
    const px = new Uint8Array(4); const out = [];
    for (let i = 0; i < k; i++) { const s = performance.now(); frame(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); out.push(performance.now() - s); }
    return out;
  };
  return {
    head, bench,
    setFocus(f) { focus = f; },
    setZoom(z) { zoom = z; },
    setOffset(x, y = offsetY) { offsetX = x; offsetY = y; },
    state: () => ({ yaw, pitch, frames, atoms: n }),
  };
}
