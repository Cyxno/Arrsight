import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from '../lib/auth.js';

async function start(configDir, port) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, CONFIG_DIR: configDir, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('startup timeout')), 5000);
    child.stdout.on('data', (data) => { if (String(data).includes('listening')) { clearTimeout(timer); resolve(); } });
    child.once('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  return child;
}

const origin = (port) => `http://127.0.0.1:${port}`;

test('one unreachable integration degrades the snapshot instead of failing it, and builds are cached and deduplicated', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arrsight-resilience-'));
  const port = 25600 + Math.floor(Math.random() * 300);
  let child;
  try {
    // A configured instance whose Sonarr URL points at a closed port: the
    // dashboard must still render everything else.
    const config = {
      configVersion: 2,
      admin: { passwordHash: await hashPassword('a secure password') },
      sonarr: { enabled: true, url: 'http://127.0.0.1:9', apiKey: 'test-key' },
      monitoring: { dockerEnabled: false, mountsEnabled: false }
    };
    await fs.writeFile(path.join(dir, 'config.json'), JSON.stringify(config));
    child = await start(dir, port);

    const login = await fetch(`${origin(port)}/api/auth/login`, {
      method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json' }, body: JSON.stringify({ password: 'a secure password' })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];

    const first = await fetch(`${origin(port)}/api/snapshot`, { headers: { cookie } });
    assert.equal(first.status, 200, 'an offline integration must not fail the whole snapshot');
    const snapshot = await first.json();
    assert.ok(snapshot.generatedAt);
    assert.equal(snapshot.health.sonarr.reachable, false);
    assert.ok(snapshot.overview);
    assert.ok(snapshot.attentionItems.some((item) => item.key === 'api:sonarr'), 'unreachable API becomes an attention item');
    assert.ok(Array.isArray(snapshot.chain) && snapshot.chain.length > 0);

    // Cached: within the TTL a second request returns the same build.
    const second = await fetch(`${origin(port)}/api/snapshot`, { headers: { cookie } });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).generatedAt, snapshot.generatedAt);

    // Concurrent forced refreshes share one build instead of racing.
    const forced = await Promise.all([1, 2, 3].map(() => fetch(`${origin(port)}/api/snapshot?force=1`, { headers: { cookie } })));
    const stamps = await Promise.all(forced.map((response) => response.json()));
    for (const value of stamps) assert.equal(value.generatedAt, stamps[0].generatedAt);
    assert.notEqual(stamps[0].generatedAt, snapshot.generatedAt, 'forced refresh must rebuild');
  } finally {
    child?.kill('SIGTERM');
    await fs.rm(dir, { recursive: true, force: true });
  }
});
