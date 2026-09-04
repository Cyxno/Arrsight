import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { sendJson, readJsonOr400, sameOrigin, fetchJson } from '../lib/http.js';
import { atomicWrite, deepMerge, integrations, migrateConfig, publicConfig, validateConfig, validateMountPath, applySecretUpdates, normalizeConfigInput } from '../lib/config.js';
import { hashPassword, setupCodeMatches } from '../lib/auth.js';
import { testIntegration } from '../lib/integrations.js';

export function createConfigRoutes(ctx) {
  async function get(req, res) {
    if (ctx.isConfigured() && ctx.adminReady() && !ctx.isAuthenticated(req)) {
      return sendJson(res, 401, { configured: true, code: 'authentication_required' });
    }
    return sendJson(res, 200, { configured: ctx.isConfigured(), config: publicConfig(ctx.getConfig()) });
  }

  async function put(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, code: 'cross_origin' });
    const body = await readJsonOr400(req, res);
    if (body === null) return;
    if (!body || typeof body !== 'object') return sendJson(res, 400, { ok: false, code: 'invalid_json' });
    const freshInstance = !ctx.isConfigured() || !ctx.adminReady();
    const setupCodeValid = freshInstance && setupCodeMatches(body?.setupCode, ctx.setupState());
    if (freshInstance && !setupCodeValid) {
      return sendJson(res, 403, { ok: false, code: Date.now() > ctx.setupState().expiresAt ? 'setup_code_expired' : 'setup_code_invalid' });
    }
    if (!freshInstance && !ctx.isAuthenticated(req)) return sendJson(res, 401, { ok: false, code: 'authentication_required' });
    const { setupCode: _setupCode, adminPassword: _adminPassword, configVersion: _configVersion, productName: _productName, port: _port, ...configBody } = body;
    const normalized = normalizeConfigInput(configBody);
    if (normalized.errors.length) return sendJson(res, 400, { ok: false, code: 'validation_failed', errors: normalized.errors });
    const candidate = normalized.value;
    const next = applySecretUpdates(migrateConfig(deepMerge(ctx.getConfig(), candidate)), ctx.getConfig());
    if (candidate.links) next.links = candidate.links;
    const errors = validateConfig(next);
    if (errors.length) return sendJson(res, 400, { ok: false, code: 'validation_failed', errors });
    if (!ctx.adminReady()) {
      try { next.admin = { passwordHash: await hashPassword(body.adminPassword) }; }
      catch { return sendJson(res, 400, { ok: false, code: 'invalid_admin_password' }); }
    }
    await atomicWrite(ctx.paths.configPath, next);
    ctx.applyConfig(next);
    ctx.snapshot.reset();
    return sendJson(res, 200, { ok: true, config: publicConfig(ctx.getConfig()) });
  }

  async function testPath(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, code: 'cross_origin' });
    if (ctx.isConfigured() && ctx.adminReady() && !ctx.isAuthenticated(req)) return sendJson(res, 401, { ok: false, code: 'authentication_required' });
    const body = await readJsonOr400(req, res);
    if (body === null) return;
    if (!validateMountPath(body?.path, body?.category)) return sendJson(res, 400, { ok: false, code: 'path_not_allowed' });
    try {
      await fs.access(path.resolve(body.path), fsConstants.R_OK);
      return sendJson(res, 200, { ok: true, code: 'path_readable' });
    } catch {
      return sendJson(res, 400, { ok: false, code: 'path_unreadable' });
    }
  }

  async function testIntegrationRoute(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, code: 'cross_origin' });
    if (ctx.isConfigured() && ctx.adminReady() && !ctx.isAuthenticated(req)) return sendJson(res, 401, { ok: false, code: 'authentication_required' });
    const body = await readJsonOr400(req, res);
    if (body === null) return;
    if (!integrations.includes(body?.name)) return sendJson(res, 400, { ok: false, code: 'unknown_integration' });
    const config = ctx.getConfig();
    const merged = deepMerge(config[body.name] || {}, body.settings || {});
    if (!merged.apiKey) merged.apiKey = config[body.name]?.apiKey || '';
    if (validateConfig({ ...config, [body.name]: merged }).length) return sendJson(res, 400, { ok: false, code: 'validation_failed' });
    if (!merged.url) return sendJson(res, 400, { ok: false, code: 'url_required' });
    const result = await testIntegration(body.name, merged, fetchJson);
    return sendJson(res, result.ok ? 200 : 502, result);
  }

  return {
    'GET /api/config': get,
    'PUT /api/config': put,
    'POST /api/test/path': testPath,
    'POST /api/test/integration': testIntegrationRoute
  };
}
