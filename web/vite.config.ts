import { defineConfig } from 'vite';

// base relativa: el sitio tiene que funcionar servido desde cualquier
// subcarpeta del vhost sin reconstruirlo. Con './' los assets se piden
// relativos al documento y no a la raiz del dominio.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsDir: 'assets',
    sourcemap: false,
    reportCompressedSize: true,
  },
  server: { port: 5173, open: false },
});
