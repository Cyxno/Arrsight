import packageJson from '../package.json' with { type: 'json' };
import { sendJson } from '../lib/http.js';

export function createMonitoringRoutes(ctx) {
  function health(req, res) {
    return sendJson(res, 200, { status: ctx.isConfigured() ? 'ok' : 'setup_required', service: 'ArrSight', version: packageJson.version });
  }

  // Snapshot and log data stay behind the administrator session once setup
  // completed; before that the dashboard is open so setup can be finished.
  function requireSnapshotAuth(req, res) {
    if (ctx.isConfigured() && ctx.adminReady() && !ctx.isAuthenticated(req)) {
      sendJson(res, 401, { ok: false, code: 'authentication_required' });
      return false;
    }
    return true;
  }

  async function snapshot(req, res, url) {
    if (!requireSnapshotAuth(req, res)) return;
    const value = await ctx.snapshot.build(url.searchParams.get('force') === '1');
    return sendJson(res, 200, value);
  }

  async function logs(req, res, url) {
    if (!requireSnapshotAuth(req, res)) return;
    const value = await ctx.snapshot.build();
    const type = url.searchParams.get('type') || 'verifier';
    return sendJson(res, 200, { type, lines: value.logs[type] || [] });
  }

  return {
    'GET /api/health': health,
    'GET /api/snapshot': snapshot,
    'GET /api/logs': logs
  };
}
