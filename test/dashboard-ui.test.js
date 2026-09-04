import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { TABS, calculateTabBadges, selectCriticalBanner, selectPrimaryAttention, tabFromHash } from '../frontend/src/lib/dashboard-ui.js';

const baseSnapshot = () => ({
  incidents: { active: [] },
  queues: { sonarr: { active: 0, stalled: 0, failed: 0 }, radarr: { active: 0, stalled: 0, failed: 0 }, nzbdav: { active: 0, stalled: 0, failed: 0 } },
  containers: []
});

test('empty or unknown hash safely resolves to overview', () => {
  assert.equal(tabFromHash('').id, 'overview');
  assert.equal(tabFromHash('#unknown').id, 'overview');
  assert.equal(tabFromHash('#/unknown').id, 'overview');
});

test('valid hashes resolve to the requested tab', () => {
  assert.equal(tabFromHash('#overview').id, 'overview');
  assert.equal(tabFromHash('#downloads').id, 'downloads');
  assert.equal(tabFromHash('#providers').id, 'providers');
  assert.equal(tabFromHash('#system').id, 'system');
  assert.equal(tabFromHash('#media').id, 'media');
  assert.equal(tabFromHash('#incidents').id, 'incidents');
  assert.equal(tabFromHash('#logs').id, 'logs');
  assert.equal(tabFromHash('#settings').id, 'settings');
  assert.equal(tabFromHash('#/settings').id, 'settings');
});

test('navigation exposes the full operations destination set', () => {
  assert.deepEqual(TABS.map((tab) => tab.id), ['overview', 'downloads', 'providers', 'media', 'incidents', 'system', 'logs', 'settings']);
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
  snapshot.incidents.active.push({ id: 'provider-trip', fingerprint: 'trip-1', severity: 'critical', source: 'Example' });
  assert.deepEqual(calculateTabBadges(snapshot).providers, { count: 1, severity: 'critical' });
});

test('a mount incident creates a system badge', () => {
  const snapshot = baseSnapshot();
  snapshot.incidents.active.push({ id: 'mount-read-check', fingerprint: 'mount-1', severity: 'critical', source: 'Live read-test' });
  assert.deepEqual(calculateTabBadges(snapshot).system, { count: 1, severity: 'critical' });
});

test('a stopped media container creates a media badge', () => {
  const snapshot = baseSnapshot();
  snapshot.containers.push({ name: 'plex', ok: false, health: null });
  assert.equal(calculateTabBadges(snapshot).media.count, 1);
  assert.equal(calculateTabBadges(snapshot).media.severity, 'critical');
});

test('global problem total deduplicates repeated incident fingerprints', () => {
  const snapshot = baseSnapshot();
  const incident = { id: 'provider-trip', fingerprint: 'same-problem', severity: 'warning', source: 'Example' };
  snapshot.incidents.active.push(incident, { ...incident, title: 'Repeated elsewhere' });
  assert.equal(calculateTabBadges(snapshot).overview.count, 1);
});

test('critical banner selects the newest critical incident and destination', () => {
  const snapshot = baseSnapshot();
  snapshot.incidents.active.push(
    { id: 'provider-trip', title: 'Provider trip', severity: 'critical', source: 'Example', advice: 'Watch provider timeouts.', lastSeen: '2026-09-02T09:00:00Z' },
    { id: 'mount-read-check', title: 'Mount offline', severity: 'critical', source: 'Read-test', advice: 'Raw backend advice', lastSeen: '2026-09-02T10:00:00Z' }
  );
  const selected = selectCriticalBanner(snapshot);
  assert.equal(selected.title, 'Mount offline'); assert.equal(selected.source, 'Read-test');
  assert.equal(selected.advice, 'Check the download-client mount, then run the mount check.', 'known attention types localize advice');
  assert.equal(selected.tab, 'system'); assert.equal(selected.detail, 'mount');
});

test('attention titles and advice localize by type with server text as fallback', async () => {
  const { setLocale } = await import('../frontend/src/lib/i18n.js');
  const snapshot = { attentionItems: [{ key: 'x', type: 'import-stuck', severity: 'critical', tab: 'downloads', title: 'Backend title fallback', advice: 'Backend advice fallback', source: 'logs', detail: 'queues', firstSeen: '2026-09-02T09:00:00Z', lastSeen: '2026-09-02T10:00:00Z' }], incidents: { active: [] }, queues: {}, containers: [] };
  const unknown = { attentionItems: [{ key: 'y', type: 'future-type', severity: 'warning', tab: 'overview', title: 'Unknown title', advice: 'Unknown advice', source: 'x', detail: 'incidents', lastSeen: '2026-09-02T10:00:00Z' }], incidents: { active: [] }, queues: {}, containers: [] };
  try {
    setLocale('en', false);
    assert.equal(selectPrimaryAttention(snapshot).title, 'Import stuck');
    assert.equal(selectPrimaryAttention(snapshot).advice, 'Completed/importPending or sample detection is stuck. Periodic cleanup should remove it and search again.');
    assert.equal(selectPrimaryAttention(unknown).title, 'Unknown title', 'uncatalogued types keep server text');
    setLocale('nl', false);
    assert.equal(selectPrimaryAttention(snapshot).title, 'Import blijft hangen');
    assert.equal(selectPrimaryAttention(snapshot).advice, 'Completed/importPending of sample-detectie loopt vast. Periodieke schoonmaak hoort dit te verwijderen en opnieuw te zoeken.');
    assert.equal(selectPrimaryAttention(unknown).advice, 'Unknown advice');
  } finally { setLocale('en', false); }
});

test('server attention list is the single source for badges banner and recommendation', () => {
  const point = { key:'queue:sonarr:42', type:'queue-failed', severity:'critical', tab:'downloads', title:'Sonarr queue failed', source:'Sonarr queue', advice:'Controleer item', detail:'queues', firstSeen:'2026-09-02T09:00:00Z', lastSeen:'2026-09-02T10:00:00Z' };
  const snapshot = { attentionItems:[point], incidents:{active:[]}, queues:{}, containers:[] };
  assert.deepEqual(calculateTabBadges(snapshot).overview, {count:1,severity:'critical'});
  assert.deepEqual(calculateTabBadges(snapshot).downloads, {count:1,severity:'critical'});
  assert.equal(selectCriticalBanner(snapshot).key, point.key);
  assert.equal(selectPrimaryAttention(snapshot).key, point.key);
});

test('SPA shell keeps system, light and dark theme choices and the app mount', async () => {
  const html = await fs.readFile(new URL('../frontend/index.html', import.meta.url), 'utf8');
  assert.match(html, /data-theme="auto"/);
  assert.match(html, /localStorage\.getItem\('arr-theme'\)/);
  assert.match(html, /<div id="app"><\/div>/);
  const topbar = await fs.readFile(new URL('../frontend/src/components/TopBar.svelte', import.meta.url), 'utf8');
  assert.match(topbar, /value="auto"/);
  assert.match(topbar, /value="light"/);
  assert.match(topbar, /value="dark"/);
  assert.match(topbar, /id="localeSelect"|aria-label=\{t\('language'\)\}/);
});

test('sidebar branding is an anchor back to overview without reloading', async () => {
  const sidebar = await fs.readFile(new URL('../frontend/src/components/Sidebar.svelte', import.meta.url), 'utf8');
  const app = await fs.readFile(new URL('../frontend/src/App.svelte', import.meta.url), 'utf8');
  assert.match(sidebar, /href="#overview"/);
  assert.match(sidebar, /aria-label=\{t\('backToOverview'\)\}/);
  assert.match(sidebar, /arrsight-mark\.svg/);
  assert.match(sidebar, /event\.preventDefault\(\)/, 'branding navigation must prevent the default anchor reload');
  assert.match(app, /class="shell"/);
});

test('header status stays dynamic and localizes failures', async () => {
  const topbar = await fs.readFile(new URL('../frontend/src/components/TopBar.svelte', import.meta.url), 'utf8');
  assert.match(topbar, /\$snapshot\?\.overview\?\.status/);
  assert.match(topbar, /t\('unavailable'\)/);
  assert.match(topbar, /loadSnapshot\(true\)/);
});

test('SPA listens for hash changes without refetching the snapshot', async () => {
  const app = await fs.readFile(new URL('../frontend/src/App.svelte', import.meta.url), 'utf8');
  assert.match(app, /addEventListener\('hashchange', onHash\)/);
  const handler = app.match(/const onHash = \(\) => \{[\s\S]*?\};/)?.[0] || '';
  assert.match(handler, /syncRouteFromLocation\(\)/);
  assert.doesNotMatch(handler, /loadSnapshot|api\./);
});

test('every navigation destination has a translated label in both languages', async () => {
  const { dictionaries } = await import('../frontend/src/lib/i18n.js');
  for (const tab of TABS) {
    assert.ok(dictionaries.en[tab.labelKey], `missing en label for ${tab.id}`);
    assert.ok(dictionaries.nl[tab.labelKey], `missing nl label for ${tab.id}`);
  }
});
