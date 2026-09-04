import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaults, validateConfig } from '../lib/config.js';
import { sessionStore, timingSafeEqualString } from '../lib/auth.js';

async function start(configDir, port) {
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, CONFIG_DIR: configDir, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('startup timeout')), 5000);
    child.stdout.on('data', (data) => { output += String(data); if (output.includes('listening')) { clearTimeout(timer); resolve(); } });
    child.once('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  return { child, output };
}

const origin = (port) => `http://127.0.0.1:${port}`;

async function completeSetup(port, code, managementMode = 'monitoring') {
  const response = await fetch(`${origin(port)}/api/config`, { method: 'PUT', headers: { origin: origin(port), 'content-type': 'application/json' }, body: JSON.stringify({ setupCode: code, adminPassword: 'a secure password', locale: 'en', managementMode }) });
  assert.equal(response.status, 200);
  const login = await fetch(`${origin(port)}/api/auth/login`, { method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json' }, body: JSON.stringify({ password: 'a secure password' }) });
  assert.equal(login.status, 200);
  return login.headers.get('set-cookie').split(';')[0];
}

test('numeric monitoring limits are enforced by config validation', () => {
  assert.deepEqual(validateConfig(structuredClone(defaults)), []);
  const oversized = structuredClone(defaults);
  oversized.monitoring.sampleMinutes = 99999;
  oversized.monitoring.retentionDays = 3651;
  const errors = validateConfig(oversized);
  assert.deepEqual(errors.sort(), ['invalid_range:monitoring.retentionDays', 'invalid_range:monitoring.sampleMinutes']);
  const boundary = structuredClone(defaults);
  boundary.monitoring.retentionDays = 3650;
  boundary.monitoring.mountTimeoutMs = 300000;
  assert.deepEqual(validateConfig(boundary), []);
});

test('timing-safe string comparison rejects mismatched values without throwing', () => {
  assert.equal(timingSafeEqualString('abc', 'abc'), true);
  assert.equal(timingSafeEqualString('abc', 'abd'), false);
  assert.equal(timingSafeEqualString('abc', 'abcd'), false);
  assert.equal(timingSafeEqualString(undefined, ''), false);
  assert.equal(timingSafeEqualString('', ''), false);
});

test('session store cleanup removes expired sessions', () => {
  const original = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    const store = sessionStore(10);
    store.create();
    store.create();
    now = 1005;
    store.create();
    now = 1012;
    assert.equal(store.size, 3);
    store.cleanup();
    assert.equal(store.size, 1, 'only the unexpired session must survive cleanup');
  } finally { Date.now = original; }
});

test('responses carry hardening headers and SPA shell is served', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arrsight-sec-')), port = 21500 + Math.floor(Math.random() * 300);
  let child;
  try {
    ({ child } = await start(dir, port));
    const health = await fetch(`${origin(port)}/api/health`);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.headers.get('x-frame-options'), 'DENY');
    assert.equal(health.headers.get('referrer-policy'), 'no-referrer');
    assert.match(health.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
    const shell = await fetch(`${origin(port)}/`);
    assert.equal(shell.status, 200);
    assert.equal(shell.headers.get('x-frame-options'), 'DENY');
    const body = await shell.text();
    assert.match(body, /<div id="app"><\/div>/);
  } finally { child?.kill('SIGTERM'); await fs.rm(dir, { recursive: true, force: true }); }
});

test('malformed JSON bodies return 400 instead of a leaking 500', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arrsight-sec-')), port = 21800 + Math.floor(Math.random() * 300);
  let child;
  try {
    ({ child } = await start(dir, port));
    const login = await fetch(`${origin(port)}/api/auth/login`, { method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json' }, body: '{"password": nope' });
    assert.equal(login.status, 400);
    assert.equal((await login.json()).code, 'invalid_json');
    const put = await fetch(`${origin(port)}/api/config`, { method: 'PUT', headers: { origin: origin(port), 'content-type': 'application/json' }, body: 'not-json' });
    assert.equal(put.status, 400);
  } finally { child?.kill('SIGTERM'); await fs.rm(dir, { recursive: true, force: true }); }
});

test('setup rejects invalid codes and repeated failed logins are rate limited', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arrsight-sec-')), port = 22100 + Math.floor(Math.random() * 300);
  let child, output = '';
  try {
    ({ child, output } = await start(dir, port));
    const code = output.match(/setup code .*: (\S+)/)?.[1];
    assert.ok(code);
    const wrong = await fetch(`${origin(port)}/api/config`, { method: 'PUT', headers: { origin: origin(port), 'content-type': 'application/json' }, body: JSON.stringify({ setupCode: 'definitely-wrong-code', adminPassword: 'a secure password' }) });
    assert.equal(wrong.status, 403);
    assert.equal((await wrong.json()).code, 'setup_code_invalid');
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetch(`${origin(port)}/api/auth/login`, { method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json' }, body: JSON.stringify({ password: 'not the password' }) });
      assert.equal(response.status, 401);
    }
    const limited = await fetch(`${origin(port)}/api/auth/login`, { method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json' }, body: JSON.stringify({ password: 'not the password' }) });
    assert.equal(limited.status, 429);
  } finally { child?.kill('SIGTERM'); await fs.rm(dir, { recursive: true, force: true }); }
});

test('management actions follow the configured management mode', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arrsight-sec-')), port = 22400 + Math.floor(Math.random() * 300);
  let child, output = '';
  try {
    ({ child, output } = await start(dir, port));
    const code = output.match(/setup code .*: (\S+)/)?.[1];
    const cookie = await completeSetup(port, code, 'monitoring');
    const monitoring = await fetch(`${origin(port)}/api/action`, { method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json', cookie }, body: JSON.stringify({ action: 'restart-container', target: 'sonarr' }) });
    assert.equal(monitoring.status, 403);

    const reconfigure = await fetch(`${origin(port)}/api/config`, { method: 'PUT', headers: { origin: origin(port), 'content-type': 'application/json', cookie }, body: JSON.stringify({ managementMode: 'containers', containers: ['sonarr', 'radarr'] }) });
    assert.equal(reconfigure.status, 200);
    const unknown = await fetch(`${origin(port)}/api/action`, { method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json', cookie }, body: JSON.stringify({ action: 'restart-container', target: 'not-in-allowlist' }) });
    assert.equal(unknown.status, 400);
    const allowed = await fetch(`${origin(port)}/api/action`, { method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json', cookie }, body: JSON.stringify({ action: 'restart-container', target: 'sonarr' }) });
    const value = await allowed.json();
    assert.equal(value.ok, false, 'restart without a usable docker socket must not claim success');
    const hostAction = await fetch(`${origin(port)}/api/action`, { method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json', cookie }, body: JSON.stringify({ action: 'run-verifier' }) });
    assert.equal(hostAction.status, 403, 'host actions require full management mode');
  } finally { child?.kill('SIGTERM'); await fs.rm(dir, { recursive: true, force: true }); }
});
