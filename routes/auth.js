import { sendJson, readJsonOr400, sameOrigin } from '../lib/http.js';
import { cookieValue, verifyPassword, requestIsSecure, sessionCookie, clearedSessionCookie, clientAddress } from '../lib/auth.js';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 60 * 1000;

export function createAuthRoutes(ctx) {
  const { sessions, failedLogins } = ctx;

  function loginKey(req) {
    return clientAddress(req);
  }

  // Periodic cleanup so abandoned throttle entries cannot accumulate forever.
  function cleanupThrottles() {
    for (const [key, attempt] of failedLogins) if (attempt.until && attempt.until < Date.now()) failedLogins.delete(key);
  }

  async function login(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, code: 'cross_origin' });
    const key = loginKey(req);
    const attempt = failedLogins.get(key) || { count: 0, until: 0 };
    if (attempt.until > Date.now()) return sendJson(res, 429, { ok: false, code: 'rate_limited' });
    const body = await readJsonOr400(req, res);
    if (body === null) return;
    if (!await verifyPassword(body?.password, ctx.getConfig().admin?.passwordHash)) {
      attempt.count++;
      attempt.until = attempt.count >= MAX_FAILED_LOGINS ? Date.now() + LOCKOUT_MS : 0;
      failedLogins.set(key, attempt);
      return sendJson(res, 401, { ok: false, code: 'invalid_credentials' });
    }
    failedLogins.delete(key);
    const token = sessions.create();
    res.setHeader('set-cookie', sessionCookie(token, { secure: requestIsSecure(req) }));
    return sendJson(res, 200, { ok: true });
  }

  async function logout(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, code: 'cross_origin' });
    sessions.remove(cookieValue(req.headers.cookie));
    res.setHeader('set-cookie', clearedSessionCookie(requestIsSecure(req)));
    return sendJson(res, 200, { ok: true });
  }

  function status(req, res) {
    return sendJson(res, 200, { authenticated: ctx.isAuthenticated(req), required: ctx.isConfigured() && ctx.adminReady() });
  }

  return {
    'GET /api/auth/status': status,
    'POST /api/auth/login': login,
    'POST /api/auth/logout': logout,
    cleanupThrottles
  };
}
