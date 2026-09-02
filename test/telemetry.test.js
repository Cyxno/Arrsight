import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIncidents, classifyOverview, classifyQueue, pruneHistory } from '../lib/telemetry.js';

test('normal active queue is informational, not degraded', () => {
  const result = classifyQueue([{ title: 'Fixture item', status: 'downloading', size: 100, sizeleft: 40, added: '2026-09-02T09:55:00Z' }], new Date('2026-09-02T10:00:00Z'));
  assert.equal(result.active, 1); assert.equal(result.stalled, 0); assert.equal(result.failed, 0); assert.equal(result.rows[0].progress, 60);
});

test('old importPending queue becomes stalled and eventually critical', () => {
  const item = { title: 'Fixture item', status: 'completed', trackedDownloadStatus: 'importPending', added: '2026-09-02T07:00:00Z' };
  const result = classifyQueue([item], new Date('2026-09-02T10:00:00Z'), 30, 120);
  assert.equal(result.failed, 1); assert.equal(result.rows[0].state, 'incident');
});

test('old log error is historical while recent provider trip is active', () => {
  const now = new Date('2026-09-02T10:00:00Z');
  const incidents = buildIncidents([
    { id: 'provider-trip', source: 'fixture', subject: 'Sunny', severity: 'critical', line: '2026-09-02T09:30:00Z Provider Sunny tripped' },
    { id: 'import-stuck', source: 'fixture', subject: 'import', severity: 'critical', line: '2026-09-01T01:00:00Z Failed to import', advice: 'Inspecteer import' }
  ], now);
  assert.equal(incidents.find((i) => i.id === 'provider-trip').active, true);
  assert.equal(incidents.find((i) => i.id === 'import-stuck').active, false);
});

test('overview keeps missing backlog and successful repairs out of incident state', () => {
  const overview = classifyOverview({ health: { sonarr: { reachable: true }, radarr: { reachable: true } }, incidents: { active: [] }, queues: { sonarr: { failed: 0, stalled: 0 }, radarr: { failed: 0, stalled: 0 }, nzbdav: { failed: 0, stalled: 0 } }, wanted: { sonarr: { missing: 50, cutoff: 0 } }, repairs: { summary: { repairs: 4 } }, mounts: { overall: 'healthy' } });
  assert.equal(overview.status, 'healthy');
});

test('history tolerates malformed values and enforces retention', () => {
  const points = [{ at: 'broken' }, { at: '2026-01-01T00:00:00Z' }, { at: '2026-09-01T00:00:00Z' }];
  assert.deepEqual(pruneHistory(points, new Date('2026-09-02T00:00:00Z'), 90), [points[2]]);
});
