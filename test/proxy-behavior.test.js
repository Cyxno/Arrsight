import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { clientAddress } from '../lib/auth.js';

async function start(configDir, port, env = {}) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, CONFIG_DIR: configDir, PORT: String(port), ...env },
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

async function completeSetup(port, code) {
  const response = await fetch(`${origin(port)}/api/config`, {
    method: 'PUT',
    headers: { origin: origin(port), 'content-type': 'application/json' },
    body: JSON.stringify({ setupCode: code, adminPassword: 'a secure password', locale: 'en', managementMode: 'monitoring' })
  });
  assert.equal(response.status, 200);
}

const loginAttempt = (port, headers = {}) => fetch(`${origin(port)}/api/auth/login`, {
  method: 'POST',
  headers: { origin: origin(port), 'content-type': 'application/json', ...headers },
  body: JSON.stringify({ password: 'not the password' })
});

test('clientAddress ignores forwarding headers unless proxy trust is enabled', () => {
  const original = process.env.ARRSIGHT_TRUST_PROXY;
  const req = (headers = {}) => ({ headers, socket: { remoteAddress: '203.0.113.10' } });
  try {
    delete process.env.ARRSIGHT_TRUST_PROXY;
    assert.equal(clientAddress(req({ 'x-forwarded-for': '198.51.100.7' })), '203.0.113.10');
    assert.equal(clientAddress(req()), '203.0.113.10');
    process.env.ARRSIGHT_TRUST_PROXY = 'true';
    assert.equal(clientAddress(req({ 'x-forwarded-for': '198.51.100.7' })), '198.51.100.7');
    assert.equal(clientAddress(req({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' })), '198.51.100.7');
    assert.equal(clientAddress(req({ 'x-forwarded-for': '   ' })), '203.0.113.10');
    assert.equal(clientAddress(req()), '203.0.113.10');
    process.env.ARRSIGHT_TRUST_PROXY = '1';
    assert.equal(clientAddress(req({ 'x-forwarded-for': '198.51.100.7' })), '203.0.113.10', 'only the exact value true opts in');
  } finally {
    if (original === undefined) delete process.env.ARRSIGHT_TRUST_PROXY;
    else process.env.ARRSIGHT_TRUST_PROXY = original;
  }
});

test('spoofed X-Forwarded-For cannot bypass login throttling when proxy trust is disabled', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arrsight-proxy-'));
  const port = 24100 + Math.floor(Math.random() * 200);
  let child, output = '';
  try {
    ({ child, output } = await start(dir, port));
    const code = output.match(/setup code .*: (\S+)/)?.[1];
    await completeSetup(port, code);
    // X-Forwarded-Proto must not smuggle a Secure cookie when trust is off.
    const login = await fetch(`${origin(port)}/api/auth/login`, {
      method: 'POST',
      headers: { origin: origin(port), 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ password: 'a secure password' })
    });
    assert.equal(login.status, 200);
    assert.equal((login.headers.get('set-cookie') || '').includes('Secure'), false);
    // Rotating client-controlled forwarding headers must not create fresh throttle buckets.
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await loginAttempt(port, { 'x-forwarded-for': `198.51.100.${attempt}` });
      assert.equal(response.status, 401);
    }
    const limited = await loginAttempt(port, { 'x-forwarded-for': '198.51.100.250' });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, 'rate_limited');
    // The lockout also holds for the correct password from the same source.
    const correct = await fetch(`${origin(port)}/api/auth/login`, {
      method: 'POST',
      headers: { origin: origin(port), 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.250' },
      body: JSON.stringify({ password: 'a secure password' })
    });
    assert.equal(correct.status, 429);
  } finally {
    child?.kill('SIGTERM');
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('explicit proxy trust honors forwarded headers for cookies and throttling', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arrsight-proxy2-'));
  const port = 24400 + Math.floor(Math.random() * 200);
  let child, output = '';
  try {
    ({ child, output } = await start(dir, port, { ARRSIGHT_TRUST_PROXY: 'true' }));
    const code = output.match(/setup code .*: (\S+)/)?.[1];
    await completeSetup(port, code);
    const login = await fetch(`${origin(port)}/api/auth/login`, {
      method: 'POST',
      headers: { origin: origin(port), 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ password: 'a secure password' })
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie') || '', /Secure/);
    // A stable forwarded client address gets its own throttle bucket.
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await loginAttempt(port, { 'x-forwarded-for': '198.51.100.7' });
      assert.equal(response.status, 401);
    }
    const limited = await loginAttempt(port, { 'x-forwarded-for': '198.51.100.7' });
    assert.equal(limited.status, 429);
    // Without the header the socket address is used, which is a different bucket.
    const socketKey = await loginAttempt(port);
    assert.equal(socketKey.status, 401);
  } finally {
    child?.kill('SIGTERM');
    await fs.rm(dir, { recursive: true, force: true });
  }
});
