import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workerPath = fileURLToPath(new URL('./mount-check-worker.js', import.meta.url));

export function classifyMountResult({ ok, timedOut = false, latencyMs, error = null }, warnMs = 1500) {
  return { ok: Boolean(ok), status: ok ? latencyMs >= warnMs ? 'degraded' : 'healthy' : 'incident', latencyMs: Math.max(0, Math.round(Number(latencyMs) || 0)), error: timedOut ? 'read timeout' : error, timedOut };
}

export function runMountReadTest(target, options = {}, run = execFile) {
  const timeoutMs = Math.max(100, Number(options.timeoutMs || 5000)); const warnMs = Number(options.warnMs || 1500); const started = performance.now();
  return new Promise((resolve) => {
    let settled = false; let child; let timer;
    const finish = (result) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ ...classifyMountResult({ ...result, latencyMs: performance.now() - started }, warnMs), checkedAt: new Date().toISOString() }); };
    timer = setTimeout(() => { if (child && !child.killed) child.kill('SIGKILL'); finish({ ok: false, timedOut: true }); }, timeoutMs);
    try {
      child = run(process.execPath, [workerPath, target], { windowsHide: true, timeout: 0 }, (error) => finish({ ok: !error, error: error?.message || null }));
      child?.once?.('error', (error) => finish({ ok: false, error: error.message }));
    } catch (error) { finish({ ok: false, error: error.message }); }
  });
}

export function updateMountState(previous = {}, checks = {}, now = new Date()) {
  const next = {};
  for (const [name, check] of Object.entries(checks)) {
    const old = previous[name] || {}; const healthy = check.ok;
    next[name] = { lastKnownGood: healthy ? check.checkedAt || now.toISOString() : old.lastKnownGood || null, lastFailure: healthy ? old.lastFailure || null : check.checkedAt || now.toISOString(), consecutiveFailures: healthy ? 0 : Number(old.consecutiveFailures || 0) + 1 };
  }
  return next;
}
