// Sirve web/dist/ bajo una SUBCARPETA y corre un comando contra el.
//
// El demo se despliega en una ruta como /genome-viewer/ dentro del vhost, no en
// la raiz. Servirlo desde la raiz durante las pruebas esconde exactamente la
// clase de fallo que importa: una ruta absoluta que funciona en localhost y da
// 404 en produccion.
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, normalize, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../dist');
// El punto de montaje es el de produccion (ichisieben.dev/genome-viewer/).
const MOUNT = process.env.AGP_MOUNT || '/genome-viewer';

// La CSP del vhost del landing (Landing/public/.htaccess) se aplica a TODO lo
// que cuelga de el, demos incluidos. Se replica aqui para que una violacion
// salga en `verify` y no en produccion, donde el navegador la calla.
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "img-src 'self' data: https://flagcdn.com; font-src 'self' data: https://fonts.gstatic.com; " +
  "connect-src 'self' https://api.open-meteo.com; object-src 'none'; base-uri 'self'; " +
  "form-action 'self'; frame-src https://www.youtube.com; frame-ancestors 'self'";
const PORT = 8099;

if (!existsSync(ROOT)) {
  console.error(`No existe ${ROOT}. Corre primero: npm run build`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (!url.pathname.startsWith(MOUNT)) {
    res.writeHead(404).end('fuera del punto de montaje');
    return;
  }
  let rel = url.pathname.slice(MOUNT.length) || '/';
  if (rel.endsWith('/')) rel += 'index.html';
  // Se resuelve y luego se comprueba que el resultado siga DENTRO de ROOT.
  // Es mas robusto que limpiar la cadena con una expresion regular, que es
  // facil de burlar con codificaciones raras de "..".
  const file = resolve(ROOT, '.' + normalize(rel));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.writeHead(403).end('fuera del directorio servido');
    return;
  }
  try {
    const body = await readFile(file);
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    // Se comprime como lo hace cualquier servidor real. Sin esto la medicion
    // con red estrangulada transfiere bytes SIN comprimir y da un tiempo que
    // no se parece a produccion: es medir mal, no medir despacio.
    const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip');
    const compressible = /text|json|javascript|svg/.test(type);
    if (acceptsGzip && compressible && body.length > 512) {
      const packed = gzipSync(body, { level: 6 });
      res.writeHead(200, {
        'content-type': type,
        'content-encoding': 'gzip',
        'vary': 'Accept-Encoding',
        'content-security-policy': CSP,
      });
      res.end(packed);
      return;
    }
    res.writeHead(200, { 'content-type': type, 'content-security-policy': CSP });
    res.end(body);
  } catch {
    // Como Hostinger con `ErrorDocument 404`: la pagina 404 propia, si existe.
    try {
      const page = await readFile(resolve(ROOT, '404.html'));
      res.writeHead(404, { 'content-type': TYPES['.html'], 'content-security-policy': CSP });
      res.end(page);
    } catch {
      res.writeHead(404).end('no encontrado');
    }
  }
});

const runIndex = process.argv.indexOf('--run');
const command = runIndex >= 0 ? process.argv[runIndex + 1] : null;

server.listen(PORT, '127.0.0.1', () => {
  console.log(`sirviendo ${ROOT} en http://127.0.0.1:${PORT}${MOUNT}/`);
  if (!command) return;
  const child = spawn(command, { shell: true, stdio: 'inherit' });
  child.on('exit', (code) => {
    server.close();
    process.exit(code ?? 0);
  });
});
