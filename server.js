import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendJson } from './lib/http.js';
import { createRuntime } from './lib/runtime.js';
import { createStaticServer } from './lib/static.js';
import { createAuthRoutes } from './routes/auth.js';
import { createConfigRoutes } from './routes/config.js';
import { createActionRoutes } from './routes/actions.js';
import { createMonitoringRoutes } from './routes/monitoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const frontendDistDir = path.join(__dirname, 'frontend', 'dist');
const configDir = path.resolve(process.env.CONFIG_DIR || (__dirname === '/app' ? '/config' : __dirname));

const ctx = await createRuntime({ appDir: __dirname, configDir });
await ctx.loadConfig();

const authRoutes = createAuthRoutes(ctx);
const routes = {
  ...authRoutes,
  ...createConfigRoutes(ctx),
  ...createActionRoutes(ctx),
  ...createMonitoringRoutes(ctx)
};

const allowedMethods = new Map();
for (const key of Object.keys(routes)) {
  const space = key.indexOf(' ');
  const method = key.slice(0, space);
  const pathname = key.slice(space + 1);
  if (!allowedMethods.has(pathname)) allowedMethods.set(pathname, new Set());
  allowedMethods.get(pathname).add(method);
}

const serveStatic = createStaticServer({ publicDir, frontendDistDir });

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = routes[`${req.method} ${url.pathname}`];
  if (route) return route(req, res, url);
  if (allowedMethods.has(url.pathname)) return sendJson(res, 405, { ok: false, code: 'method_not_allowed' });
  if (!ctx.isConfigured() && url.pathname.startsWith('/api/')) return sendJson(res, 503, { ok: false, code: 'setup_required' });
  return serveStatic(req, res);
}

const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => {
    console.error('Request failed:', error.message);
    if (!res.headersSent) sendJson(res, 500, { ok: false, code: 'internal_error' });
  });
});

server.listen(ctx.getConfig().port, '0.0.0.0', () => {
  console.log(`ArrSight listening on http://0.0.0.0:${ctx.getConfig().port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));

setInterval(async () => {
  try { await ctx.snapshot.build(true); } catch (error) { console.error('Background measurement failed:', error.message); }
}, Math.max(1, Number(ctx.getConfig().monitoring.sampleMinutes || 5)) * 60000).unref();

setInterval(() => {
  ctx.sessions.cleanup();
  authRoutes.cleanupThrottles();
}, 10 * 60 * 1000).unref();
