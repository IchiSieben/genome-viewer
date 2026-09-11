// Sirve web/dist/ bajo una SUBCARPETA y corre un comando contra el.
//
// El demo se despliega en una ruta como /alphagenome/ dentro del vhost, no en
// la raiz. Servirlo desde la raiz durante las pruebas esconde exactamente la
// clase de fallo que importa: una ruta absoluta que funciona en localhost y da
// 404 en produccion.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, normalize, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../dist');
const MOUNT = '/alphagenome';
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
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('no encontrado');
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
