import fs from 'node:fs/promises';
import path from 'node:path';
import { sendJson, readJsonOr400, sameOrigin, fetchJson } from '../lib/http.js';

// Predefined ArrSight host/Arr actions. Arbitrary actions, containers, or
// shell commands are never accepted; enforcement is entirely server-side.
const HOST_ACTIONS = new Set(['run-verifier', 'run-periodic', 'run-watchdog']);
const ARR_COMMANDS = {
  'sonarr-missing-search': ['sonarr', 'MissingEpisodeSearch'],
  'sonarr-cutoff-search': ['sonarr', 'CutoffUnmetEpisodeSearch'],
  'sonarr-rss-sync': ['sonarr', 'RssSync'],
  'sonarr-refresh-downloads': ['sonarr', 'RefreshMonitoredDownloads'],
  'radarr-missing-search': ['radarr', 'MissingMoviesSearch'],
  'radarr-cutoff-search': ['radarr', 'CutoffUnmetMoviesSearch'],
  'radarr-rss-sync': ['radarr', 'RssSync'],
  'radarr-refresh-downloads': ['radarr', 'RefreshMonitoredDownloads']
};

export function knownActions() {
  return ['restart-container', ...Object.keys(ARR_COMMANDS), ...HOST_ACTIONS];
}

export function createActionRoutes(ctx) {
  let actionRunning = false;

  async function arrCommand(app, name) {
    const base = ctx.getConfig()[app];
    const result = await fetchJson(`${base.url}/api/v3/command?apikey=${encodeURIComponent(base.apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
      timeoutMs: 15000
    });
    return { ok: result.ok, status: result.status, data: result.data };
  }

  async function queueHostAction(action) {
    if (!HOST_ACTIONS.has(action)) return { ok: false, status: 400, code: 'invalid_action' };
    const actionDir = ctx.getConfig().paths.actionDir;
    await fs.mkdir(actionDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const requestPath = path.join(actionDir, `${stamp}-${action}.request`);
    await fs.writeFile(requestPath, JSON.stringify({ action, requestedAt: new Date().toISOString() }) + '\n', { mode: 0o600 });
    return { ok: true, status: 202, queued: true, action, request: path.basename(requestPath) };
  }

  async function runAction(body) {
    const config = ctx.getConfig();
    if (config.managementMode === 'monitoring') return { ok: false, status: 403, code: 'management_disabled' };
    if (actionRunning) return { ok: false, status: 409, code: 'action_in_progress' };
    const action = body?.action;
    if (typeof action !== 'string' || action.length > 80) return { ok: false, status: 400, code: 'invalid_action' };
    actionRunning = true;
    try {
      if (action === 'restart-container') {
        const target = String(body?.target || '');
        if (!config.containers.includes(target)) return { ok: false, status: 400, code: 'container_not_allowed' };
        const result = await ctx.docker.post(`/containers/${encodeURIComponent(target)}/restart?t=10`);
        ctx.snapshot.invalidate();
        return { ok: result.ok, status: result.status, action, target, ...(result.ok ? {} : { detail: result.text }) };
      }
      // Everything beyond restart-container requires full management mode.
      if (config.managementMode !== 'full') return { ok: false, status: 403, code: 'full_management_required' };

      if (ARR_COMMANDS[action]) {
        const [app, command] = ARR_COMMANDS[action];
        const result = await arrCommand(app, command);
        ctx.snapshot.invalidate();
        return { ok: result.ok, status: result.status, action, app, command, ...(result.ok || result.data == null ? {} : { detail: result.data }) };
      }

      if (HOST_ACTIONS.has(action)) {
        const result = await queueHostAction(action);
        ctx.snapshot.invalidate();
        return result;
      }

      return { ok: false, status: 400, code: 'invalid_action' };
    } finally {
      actionRunning = false;
    }
  }

  async function action(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, code: 'cross_origin' });
    if (ctx.isConfigured() && ctx.adminReady() && !ctx.isAuthenticated(req)) return sendJson(res, 401, { ok: false, code: 'authentication_required' });
    const body = await readJsonOr400(req, res);
    if (body === null) return;
    const result = await runAction(body);
    return sendJson(res, result.status || (result.ok ? 200 : 400), result);
  }

  return { 'POST /api/action': action };
}
