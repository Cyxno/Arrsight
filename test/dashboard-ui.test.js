import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { calculateTabBadges, selectCriticalBanner, selectPrimaryAttention, tabFromHash } from '../public/dashboard-ui.js';

const baseSnapshot = () => ({
  incidents: { active: [] },
  queues: { sonarr: { active: 0, stalled: 0, failed: 0 }, radarr: { active: 0, stalled: 0, failed: 0 }, nzbdav: { active: 0, stalled: 0, failed: 0 } },
  containers: []
});

test('empty or unknown hash safely resolves to overview', () => {
  assert.equal(tabFromHash('').id, 'overview');
  assert.equal(tabFromHash('#unknown').id, 'overview');
});

test('valid hashes resolve to the requested tab', () => {
  assert.equal(tabFromHash('#overview').id, 'overview');
  assert.equal(tabFromHash('#downloads').id, 'downloads');
  assert.equal(tabFromHash('#providers').id, 'providers');
  assert.equal(tabFromHash('#system').id, 'system');
});

test('normal active downloads do not create a downloads badge', () => {
  const snapshot = baseSnapshot();
  snapshot.queues.sonarr.active = 3;
  assert.equal(calculateTabBadges(snapshot).downloads.count, 0);
});

test('failed and stalled downloads create a downloads badge with the strongest severity', () => {
  const snapshot = baseSnapshot();
  snapshot.queues.sonarr.stalled = 1;
  snapshot.queues.radarr.failed = 1;
  assert.deepEqual(calculateTabBadges(snapshot).downloads, { count: 2, severity: 'critical' });
});

test('an active provider trip creates a providers badge', () => {
  const snapshot = baseSnapshot();
  snapshot.incidents.active.push({ id: 'provider-trip', fingerprint: 'trip-1', severity: 'critical', source: 'Sunny' });
  assert.deepEqual(calculateTabBadges(snapshot).providers, { count: 1, severity: 'critical' });
});

test('a mount incident creates a system badge', () => {
  const snapshot = baseSnapshot();
  snapshot.incidents.active.push({ id: 'mount-read-check', fingerprint: 'mount-1', severity: 'critical', source: 'Live read-test' });
  assert.deepEqual(calculateTabBadges(snapshot).system, { count: 1, severity: 'critical' });
});

test('global problem total deduplicates repeated incident fingerprints', () => {
  const snapshot = baseSnapshot();
  const incident = { id: 'provider-trip', fingerprint: 'same-problem', severity: 'warning', source: 'Viper' };
  snapshot.incidents.active.push(incident, { ...incident, title: 'Repeated elsewhere' });
  assert.equal(calculateTabBadges(snapshot).overview.count, 1);
});

test('critical banner selects the newest critical incident and destination', () => {
  const snapshot = baseSnapshot();
  snapshot.incidents.active.push(
    { id: 'provider-trip', title: 'Provider trip', severity: 'critical', source: 'Sunny', advice: 'Controleer provider', lastSeen: '2026-09-02T09:00:00Z' },
    { id: 'mount-read-check', title: 'Mount offline', severity: 'critical', source: 'Read-test', advice: 'Controleer mount', lastSeen: '2026-09-02T10:00:00Z' }
  );
  const selected = selectCriticalBanner(snapshot);
  assert.equal(selected.title, 'Mount offline'); assert.equal(selected.source, 'Read-test'); assert.equal(selected.advice, 'Controleer mount'); assert.equal(selected.tab, 'system'); assert.equal(selected.detail, 'mount');
});

test('server attention list is the single source for badges banner and recommendation', () => {
  const point = { key:'queue:sonarr:42', type:'queue-failed', severity:'critical', tab:'downloads', title:'Sonarr queue failed', source:'Sonarr queue', advice:'Controleer item', detail:'queues', firstSeen:'2026-09-02T09:00:00Z', lastSeen:'2026-09-02T10:00:00Z' };
  const snapshot = { attentionItems:[point], incidents:{active:[]}, queues:{}, containers:[] };
  assert.deepEqual(calculateTabBadges(snapshot).overview, {count:1,severity:'critical'});
  assert.deepEqual(calculateTabBadges(snapshot).downloads, {count:1,severity:'critical'});
  assert.equal(selectCriticalBanner(snapshot).key, point.key);
  assert.equal(selectPrimaryAttention(snapshot).key, point.key);
});

test('HTML keeps light, dark and system theme choices and accessible panels', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /value="auto"[^>]*>System/);
  assert.match(html, /value="light"[^>]*>Light/);
  assert.match(html, /value="dark"[^>]*>Dark/);
  assert.match(html, /id="localeSelect"/);
  assert.equal((html.match(/data-panel="/g) || []).length, 4);
});

test('client listens for hash changes without loading another snapshot', async () => {
  const source = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /addEventListener\('hashchange', handleHashChange\)/);
  const handler = source.match(/function handleHashChange\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(handler, /renderTabs\(\)/);
  assert.doesNotMatch(handler, /load\(/);
});
