import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { newSetupCode, setupCodeMatches } from '../lib/auth.js';

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

const putConfig = (port, body, headers = {}) => fetch(`${origin(port)}/api/config`, {
  method: 'PUT',
  headers: { origin: origin(port), 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body)
});

test('setup code matching is timing-safe, expiry-aware, and single-use in practice', () => {
  const state = newSetupCode();
  const at = Date.now();
  assert.equal(setupCodeMatches(state.code, state, at), true);
  assert.equal(setupCodeMatches('totally-wrong', state, at), false);
  assert.equal(setupCodeMatches(undefined, state, at), false);
  assert.equal(setupCodeMatches(state.code, state, state.expiresAt + 1), false, 'expired codes must be rejected');
  assert.equal(setupCodeMatches('anything', { code: null, expiresAt: 0 }), false, 'consumed code state never matches');
  assert.equal(newSetupCode().code.length >= 20, true);
});

test('setup rejects wrong codes and a configured instance cannot be overwritten anonymously', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arrsight-setup-'));
  const port = 25000 + Math.floor(Math.random() * 200);
  let child, output = '';
  try {
    ({ child, output } = await start(dir, port));
    const code = output.match(/setup code .*: (\S+)/)?.[1];
    assert.ok(code);

    // Incorrect setup code.
    const wrong = await putConfig(port, { setupCode: 'definitely-not-it', adminPassword: 'a secure password', locale: 'en' });
    assert.equal(wrong.status, 403);
    assert.equal((await wrong.json()).code, 'setup_code_invalid');

    // Missing setup code entirely.
    const missing = await putConfig(port, { adminPassword: 'a secure password', locale: 'en' });
    assert.equal(missing.status, 403);
    assert.equal((await missing.json()).code, 'setup_code_invalid');

    // Correct code configures the instance.
    const good = await putConfig(port, { setupCode: code, adminPassword: 'a secure password', locale: 'en', managementMode: 'monitoring' });
    assert.equal(good.status, 200);

    // The consumed setup code no longer grants anything: anonymous writes now
    // need a session, whether or not the old code is replayed.
    const anonymous = await putConfig(port, { locale: 'nl' });
    assert.equal(anonymous.status, 401);
    assert.equal((await anonymous.json()).code, 'authentication_required');
    const replay = await putConfig(port, { setupCode: code, locale: 'nl' });
    assert.equal(replay.status, 401);
    assert.equal((await replay.json()).code, 'authentication_required');
  } finally {
    child?.kill('SIGTERM');
    await fs.rm(dir, { recursive: true, force: true });
  }
});
