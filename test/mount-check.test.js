import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMountResult, runMountReadTest, updateMountState } from '../lib/mount-check.js';

test('mount classification handles healthy slow missing and timeout results', () => {
  assert.equal(classifyMountResult({ok:true,latencyMs:5},100).status, 'healthy');
  assert.equal(classifyMountResult({ok:true,latencyMs:150},100).status, 'degraded');
  assert.equal(classifyMountResult({ok:false,latencyMs:5,error:'ENOENT'},100).status, 'incident');
  assert.equal(classifyMountResult({ok:false,timedOut:true,latencyMs:100},100).error, 'read timeout');
});

test('killable mount runner terminates a timed out child', async () => {
  let killed = false;
  const run = () => ({ killed:false, kill(){ killed=true; this.killed=true; }, once(){} });
  const result = await runMountReadTest('/fixture', {timeoutMs:100}, run);
  assert.equal(result.timedOut, true); assert.equal(killed, true);
});

test('last known good survives failures and resets failure streak after recovery', () => {
  const healthy = updateMountState({}, {mount:{ok:true,checkedAt:'2026-09-02T09:00:00Z'}});
  const failed = updateMountState(healthy, {mount:{ok:false,checkedAt:'2026-09-02T10:00:00Z'}});
  const failedAgain = updateMountState(failed, {mount:{ok:false,checkedAt:'2026-09-02T11:00:00Z'}});
  assert.equal(failedAgain.mount.lastKnownGood, '2026-09-02T09:00:00Z'); assert.equal(failedAgain.mount.consecutiveFailures, 2);
  const recovered = updateMountState(failedAgain, {mount:{ok:true,checkedAt:'2026-09-02T12:00:00Z'}});
  assert.equal(recovered.mount.lastKnownGood, '2026-09-02T12:00:00Z'); assert.equal(recovered.mount.consecutiveFailures, 0); assert.equal(recovered.mount.lastFailure, '2026-09-02T11:00:00Z');
});
