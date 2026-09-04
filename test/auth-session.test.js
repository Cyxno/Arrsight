import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function start(configDir, port) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, CONFIG_DIR: configDir, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('startup timeout')), 5000);
    child.stdout.on('data', (data) => { output += String(data); if (output.includes('listening')) { clearTimeout(timer); resolve(); } });
    child.once('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  return { child, output };
}

const origin = (port) => `http://127.0.0.1:${port}`;

test('login lifecycle: failure, success, logout invalidation, and protected routes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arrsight-session-'));
  const port = 24700 + Math.floor(Math.random() * 200);
  let child, output = '';
  try {
    ({ child, output } = await start(dir, port));
    const code = output.match(/setup code .*: (\S+)/)?.[1];
    assert.ok(code);
    const setup = await fetch(`${origin(port)}/api/config`, {
      method: 'PUT',
      headers: { origin: origin(port), 'content-type': 'application/json' },
      body: JSON.stringify({ setupCode: code, adminPassword: 'a secure password', locale: 'en', managementMode: 'monitoring' })
    });
    assert.equal(setup.status, 200);

    // Wrong password is rejected with a stable code.
    const bad = await fetch(`${origin(port)}/api/auth/login`, {
      method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json' }, body: JSON.stringify({ password: 'wrong' })
    });
    assert.equal(bad.status, 401);
    assert.equal((await bad.json()).code, 'invalid_credentials');

    // Status endpoint reports unauthenticated before login.
    let status = await (await fetch(`${origin(port)}/api/auth/status`)).json();
    assert.deepEqual(status, { authenticated: false, required: true });

    // Every authenticated endpoint rejects before login.
    for (const [pathInfo, init] of [
      ['/api/config', {}],
      ['/api/snapshot', {}],
      ['/api/logs?type=verifier', {}],
      ['/api/action', { method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json' }, body: '{"action":"restart-container"}' }],
      ['/api/test/path', { method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json' }, body: '{"path":"/media/tv","category":"tv"}' }],
      ['/api/test/integration', { method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json' }, body: '{"name":"sonarr","settings":{}}' }]
    ]) {
      const response = await fetch(`${origin(port)}${pathInfo}`, init);
      assert.equal(response.status, 401, `${pathInfo} must require authentication`);
      assert.equal((await response.json()).code, 'authentication_required');
    }

    // Wrong method on a known path is a method error, not a 500.
    const wrongMethod = await fetch(`${origin(port)}/api/config`, { method: 'DELETE' });
    assert.equal(wrongMethod.status, 405);
    assert.equal((await wrongMethod.json()).code, 'method_not_allowed');

    // Successful login issues a session cookie that grants access.
    const login = await fetch(`${origin(port)}/api/auth/login`, {
      method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json' }, body: JSON.stringify({ password: 'a secure password' })
    });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    status = await (await fetch(`${origin(port)}/api/auth/status`, { headers: { cookie } })).json();
    assert.deepEqual(status, { authenticated: true, required: true });

    // Logout invalidates exactly this session.
    const logout = await fetch(`${origin(port)}/api/auth/logout`, { method: 'POST', headers: { origin: origin(port), cookie } });
    assert.equal(logout.status, 200);
    const afterLogout = await fetch(`${origin(port)}/api/snapshot`, { headers: { cookie } });
    assert.equal(afterLogout.status, 401);
    status = await (await fetch(`${origin(port)}/api/auth/status`, { headers: { cookie } })).json();
    assert.equal(status.authenticated, false);
  } finally {
    child?.kill('SIGTERM');
    await fs.rm(dir, { recursive: true, force: true });
  }
});
