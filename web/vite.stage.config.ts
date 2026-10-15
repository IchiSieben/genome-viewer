import { defineConfig } from 'vite';

// The stage (stage.html -> / and /es/ via scripts/build-stage.mjs) is a second, separate
// Vite build. One multi-entry build made Rollup split Vite's preload helper into a chunk
// shared by both pages, so the viewer gained a request on its critical path. Two builds keep
// the viewer's output byte-identical to what it was before the stage existed (invariant I4).
export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    target: 'es2022',
    assetsDir: 'assets',
    sourcemap: false,
    reportCompressedSize: true,
    emptyOutDir: false,
    rollupOptions: { input: { stage: 'stage.html' } },
  },
});
