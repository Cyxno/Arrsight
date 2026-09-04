import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../server.js', import.meta.url));

// Runs with cwd = the temp config dir so the allowlisted relative action
// directory ("actions") stays inside the test sandbox.
async function start(configDir, port) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: configDir,
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

async function completeSetup(port, code, managementMode, containers = []) {
  const response = await fetch(`${origin(port)}/api/config`, {
    method: 'PUT',
    headers: { origin: origin(port), 'content-type': 'application/json' },
    body: JSON.stringify({ setupCode: code, adminPassword: 'a secure password', locale: 'en', managementMode, containers })
  });
  assert.equal(response.status, 200);
  const login = await fetch(`${origin(port)}/api/auth/login`, {
    method: 'POST', headers: { origin: origin(port), 'content-type': 'application/json' }, body: JSON.stringify({ password: 'a secure password' })
  });
  assert.equal(login.status, 200);
  return login.headers.get('set-cookie').split(';')[0];
}

const action = (port, cookie, body) => fetch(`${origin(port)}/api/action`, {
  method: 'POST',
  headers: { origin: origin(port), 'content-type': 'application/json', cookie },
  body: JSON.stringify(body)
});

test('management modes enforce the documented server-side boundaries', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arrsight-modes-'));
  const port = 25300 + Math.floor(Math.random() * 200);
  let child, output = '';
  try {
    ({ child, output } = await start(dir, port));
    const code = output.match(/setup code .*: (\S+)/)?.[1];
    const cookie = await completeSetup(port, code, 'monitoring');

    // monitoring: strictly read-only, every action family is refused.
    for (const body of [
      { action: 'restart-container', target: 'sonarr' },
      { action: 'run-verifier' },
      { action: 'sonarr-missing-search' }
    ]) {
      const response = await action(port, cookie, body);
      assert.equal(response.status, 403, `${body.action} must be disabled in monitoring mode`);
      assert.equal((await response.json()).code, 'management_disabled');
    }

    // containers mode: only allowlisted container restarts; no host actions.
    const reconfigure = await fetch(`${origin(port)}/api/config`, {
      method: 'PUT',
      headers: { origin: origin(port), 'content-type': 'application/json', cookie },
      body: JSON.stringify({ managementMode: 'containers', containers: ['sonarr', 'radarr'] })
    });
    assert.equal(reconfigure.status, 200);

    const notAllowlisted = await action(port, cookie, { action: 'restart-container', target: 'not-allowlisted' });
    assert.equal(notAllowlisted.status, 400);
    assert.equal((await notAllowlisted.json()).code, 'container_not_allowed');

    const noTarget = await action(port, cookie, { action: 'restart-container' });
    assert.equal(noTarget.status, 400);
    assert.equal((await noTarget.json()).code, 'container_not_allowed');

    const hostAction = await action(port, cookie, { action: 'run-verifier' });
    assert.equal(hostAction.status, 403);
    assert.equal((await hostAction.json()).code, 'full_management_required');

    const arrAction = await action(port, cookie, { action: 'sonarr-missing-search' });
    assert.equal(arrAction.status, 403);
    assert.equal((await arrAction.json()).code, 'full_management_required');

    // Structurally invalid actions are client errors in every mode.
    for (const body of [{ action: 42 }, {}, { action: 'x'.repeat(81) }]) {
      const response = await action(port, cookie, body);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'invalid_action');
    }

    // full mode: host action is queued as a request file under the configured
    // action directory — never an arbitrary command.
    const fullMode = await fetch(`${origin(port)}/api/config`, {
      method: 'PUT',
      headers: { origin: origin(port), 'content-type': 'application/json', cookie },
      body: JSON.stringify({ managementMode: 'full', paths: { actionDir: 'actions' } })
    });
    assert.equal(fullMode.status, 200);
    const queued = await action(port, cookie, { action: 'run-periodic' });
    assert.equal(queued.status, 202);
    const queuedBody = await queued.json();
    assert.equal(queuedBody.ok, true);
    assert.equal(queuedBody.action, 'run-periodic');
    assert.match(queuedBody.request, /^[\d\-TZ:.]+-run-periodic\.request$/);
    const requestFile = path.join(dir, 'actions', queuedBody.request);
    const requestContent = JSON.parse(await fs.readFile(requestFile, 'utf8'));
    assert.deepEqual(Object.keys(requestContent).sort(), ['action', 'requestedAt']);

    // Arbitrary container targets stay rejected in full mode too.
    const arbitrary = await action(port, cookie, { action: 'restart-container', target: 'docker' });
    assert.equal(arbitrary.status, 400);
    assert.equal((await arbitrary.json()).code, 'container_not_allowed');

    // In full mode, unknown action names are rejected as client errors.
    for (const body of [{ action: 'reboot-host' }, { action: 'docker /containers/x/kill' }]) {
      const response = await action(port, cookie, body);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'invalid_action');
    }

    // Arr command in full mode reaches the configured integration only; with
    // no Sonarr reachable it reports failure instead of 403.
    const arr = await action(port, cookie, { action: 'sonarr-rss-sync' });
    assert.notEqual(arr.status, 403);
    const arrBody = await arr.json();
    assert.equal(arrBody.ok, false);
    assert.equal(arrBody.app, 'sonarr');
    assert.equal(arrBody.command, 'RssSync');
  } finally {
    child?.kill('SIGTERM');
    await fs.rm(dir, { recursive: true, force: true });
  }
});
