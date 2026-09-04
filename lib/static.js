import fs from 'node:fs/promises';
import path from 'node:path';
import { sendText, securityHeaders } from './http.js';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

export function createStaticServer({ publicDir, frontendDistDir }) {
  return async function serveStatic(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const requested = url.pathname === '/' || url.pathname === '/setup' ? '/index.html' : url.pathname;
    // Docker images receive the built SPA in public/; source checkouts fall back to frontend/dist.
    for (const root of [publicDir, frontendDistDir]) {
      const filePath = path.normalize(path.join(root, requested));
      if (!filePath.startsWith(root)) return sendText(res, 403, 'Forbidden');
      try {
        const data = await fs.readFile(filePath);
        const headers = {
          'content-type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          ...securityHeaders,
          'cache-control': requested.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store'
        };
        res.writeHead(200, headers);
        res.end(data);
        return;
      } catch { /* try the next static root */ }
    }
    sendText(res, 404, 'Not found');
  };
}
