// Local dev server: static files + the same handlers the Edge Functions use.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleConfig, handleTurn, handleTts, handleStt, handleDebrief } from '../supabase/functions/_shared/handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4351);
const routes = { 'fh-config': handleConfig, 'fh-turn': handleTurn, 'fh-tts': handleTts, 'fh-stt': handleStt, 'fh-debrief': handleDebrief };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const m = url.pathname.match(/^\/functions\/v1\/(fh-[a-z]+)$/);
  if (m && routes[m[1]]) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks);
    const request = new Request(url, { method: req.method, headers: req.headers, body });
    const t0 = Date.now();
    const response = await routes[m[1]](request, process.env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
    }
    res.end();
    console.log(`${req.method} ${m[1]} ${response.status} ${Date.now() - t0}ms`);
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || file.includes(`${path.sep}.env`)) { res.writeHead(403); return res.end(); }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, () => console.log(`forhandling dev on http://localhost:${PORT}`));
