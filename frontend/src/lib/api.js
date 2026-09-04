export class ApiError extends Error {
  constructor(status, code, body) {
    super(code || `HTTP ${status}`);
    this.status = status;
    this.code = code || null;
    this.body = body ?? null;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new ApiError(0, 'network_error');
  }
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new ApiError(response.status, body?.code, body);
  return body;
}

const jsonBody = (payload) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload)
});

export const api = {
  authStatus: () => request('/api/auth/status'),
  login: (password) => request('/api/auth/login', jsonBody({ password })),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  config: () => request('/api/config'),
  saveConfig: (payload) => request('/api/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }),
  snapshot: (force = false) => request(`/api/snapshot${force ? '?force=1' : ''}`),
  logs: (type) => request(`/api/logs?type=${encodeURIComponent(type)}`),
  testPath: (path, category) => request('/api/test/path', jsonBody({ path, category })),
  testIntegration: (name, settings) => request('/api/test/integration', jsonBody({ name, settings })),
  action: (action, target) => request('/api/action', jsonBody(target ? { action, target } : { action }))
};
