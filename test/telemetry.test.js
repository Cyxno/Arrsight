import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttentionItems, buildIncidents, classifyOverview, classifyQueue, deriveProviders, metricPoint, normalizeQueueRecord, parseOperationalHistory, pruneHistory, reconcileIncidentHistory, trend, verifierSummary } from '../lib/telemetry.js';

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

test('arr adapter uses added timestamp and timeleft only as ETA', () => {
  const row = normalizeQueueRecord({ id: 7, status: 'downloading', added: '2026-09-02T09:00:00Z', timeleft: '00:15:00', size: 100, sizeleft: 25 }, 'sonarr', new Date('2026-09-02T10:00:00Z'));
  assert.equal(row.addedAt, '2026-09-02T09:00:00.000Z'); assert.equal(row.ageMinutes, 60); assert.equal(row.eta, '00:15:00'); assert.equal(row.progress, 75);
});

test('InfiniDysk without start timestamp never invents age from timeleft', () => {
  const row = normalizeQueueRecord({ nzo_id: 'abc', status: 'downloading', timeleft: '01:00:00' }, 'nzbdav', new Date('2026-09-02T10:00:00Z'));
  assert.equal(row.addedAt, null); assert.equal(row.ageMinutes, null); assert.equal(row.state, 'active'); assert.equal(row.progress, null);
});

test('explicit failure remains critical without age', () => {
  assert.equal(normalizeQueueRecord({ status: 'failed' }, 'sonarr').state, 'incident');
});

test('stale import is warning before critical threshold', () => {
  const row = normalizeQueueRecord({ status: 'completed', trackedDownloadStatus: 'importPending', added: '2026-09-02T09:00:00Z' }, 'radarr', new Date('2026-09-02T10:00:00Z'), 30, 120);
  assert.equal(row.state, 'degraded'); assert.equal(row.phase, 'import');
});

test('attention list makes stopped Plex critical and overview count exact', () => {
  const snapshot = { incidents:{active:[]}, queues:{}, health:{sonarr:{reachable:true},radarr:{reachable:true}}, mounts:{overall:'healthy',checks:{}}, docker:{reachable:true}, containers:[{name:'binhex-plexpass',exists:true,ok:false,status:'exited'}] };
  snapshot.attentionItems = buildAttentionItems(snapshot, new Date('2026-09-02T10:00:00Z'));
  const overview = classifyOverview(snapshot);
  assert.equal(snapshot.attentionItems.length, 1); assert.equal(snapshot.attentionItems[0].key, 'container:binhex-plexpass'); assert.equal(overview.activeProblems, 1); assert.equal(overview.status, 'incident');
});

test('failed queue unhealthy container API and mount share one exact attention count', () => {
  const snapshot = { incidents:{active:[]}, queues:{sonarr:{rows:[{id:'42',state:'incident'}]},radarr:{rows:[]},nzbdav:{rows:[]}}, health:{sonarr:{reachable:false,checkedAt:'2026-09-02T10:00:00Z'},radarr:{reachable:true}}, mounts:{overall:'incident',checks:{media:{status:'incident',checkedAt:'2026-09-02T10:00:00Z'}}}, docker:{reachable:true}, containers:[{name:'Plex',exists:true,ok:true,health:'unhealthy'}], repairs:{summary:{}} };
  snapshot.attentionItems = buildAttentionItems(snapshot, new Date('2026-09-02T10:00:00Z'));
  assert.deepEqual(snapshot.attentionItems.map((item)=>item.key).sort(), ['api:sonarr','container:Plex','mount:media','queue:sonarr:42']);
  assert.equal(classifyOverview(snapshot).activeProblems, 4); assert.equal(classifyOverview(snapshot).status, 'incident');
});

test('provider detection is dynamic and expired trips recover', () => {
  const now = new Date('2026-09-02T10:00:00Z');
  const events = [
    { id:'provider-trip', subject:'Viper', line:'2026-09-02T09:30:00Z Provider "Viper" tripped' },
    { id:'provider-trip', subject:'news.third.example', line:'2026-09-02T09:40:00Z Provider news.third.example tripped' }
  ];
  const active = buildIncidents(events, now);
  const providers = deriveProviders(events, active, now);
  assert.equal(providers.find((item) => item.name === 'Viper').status, 'degraded');
  assert.ok(providers.some((item) => item.name === 'news.third.example'));
  const later = new Date('2026-09-02T12:00:00Z');
  assert.equal(deriveProviders(events, buildIncidents(events, later), later).find((item) => item.name === 'Viper').status, 'healthy');
});

test('historical missing articles do not create current provider outage', () => {
  const now = new Date('2026-09-02T10:00:00Z'); const events = [{ id:'missing-articles', subject:'Viper', line:'2026-09-02T01:00:00Z news.vipernews.com missing articles' }];
  assert.equal(deriveProviders(events, buildIncidents(events, now), now)[0].status, 'healthy');
});

test('repeated connection limit is an active provider incident', () => {
  const now = new Date('2026-09-02T10:00:00Z'); const events = [{ id:'provider-connection', subject:'Viper', line:'2026-09-02T09:50:00Z Last error from "Viper": connection limit' }];
  assert.equal(deriveProviders(events, buildIncidents(events, now), now)[0].status, 'incident');
});

test('release names filenames versions and IP-like text are not providers',()=>{const now=new Date('2026-09-03T12:00:00Z');for(const subject of ['Show.Name.S01E02.1080p-GROUP','movie.final.mkv','v1.2.3','203.0.113.42']){const events=[{id:'provider-trip',subject,line:`2026-09-03T11:00:00Z ${subject}`}];assert.deepEqual(deriveProviders(events,buildIncidents(events,now),now),[]);}});

test('active incident snapshots do not increment occurrence count',()=>{const now=new Date('2026-09-03T10:00:00Z');const current={fingerprint:'api:x',id:'api-unreachable',count:1,lastSeen:now.toISOString()};const first=reconcileIncidentHistory([], [current], now);const repeated=reconcileIncidentHistory(first.entries,[{...current,lastSeen:'2026-09-03T10:05:00Z'}],new Date('2026-09-03T10:05:00Z'));assert.equal(repeated.active[0].count,1);assert.equal(repeated.active[0].firstSeen,first.active[0].firstSeen);});

test('incident lifecycle preserves first seen and separates resolved from historical', () => {
  const first = reconcileIncidentHistory([], [{ fingerprint:'api:sonarr', id:'api-unreachable', title:'API down', severity:'critical', source:'test', firstSeen:'2026-09-01T00:00:00Z', lastSeen:'2026-09-01T00:00:00Z' }], new Date('2026-09-01T00:00:00Z'));
  const repeated = reconcileIncidentHistory(first.entries, [{ fingerprint:'api:sonarr', id:'api-unreachable', title:'API down', severity:'critical', source:'test', lastSeen:'2026-09-01T01:00:00Z' }], new Date('2026-09-01T01:00:00Z'));
  assert.equal(repeated.active[0].firstSeen, '2026-09-01T00:00:00Z');
  const resolved = reconcileIncidentHistory(repeated.entries, [], new Date('2026-09-01T02:00:00Z'));
  assert.equal(resolved.resolved.length, 1); assert.equal(resolved.historical.length, 0); assert.equal(resolved.active.length, 0);
  const historical = reconcileIncidentHistory(resolved.entries, [], new Date('2026-09-05T02:00:00Z'));
  assert.equal(historical.resolved.length, 0); assert.equal(historical.historical.length, 1);
});

test('empty and damaged operational history recover safely', () => {
  assert.deepEqual(parseOperationalHistory(''), {version:1,incidents:[],mounts:{},containerRestarts:{}});
  assert.deepEqual(parseOperationalHistory('{broken'), {version:1,incidents:[],mounts:{},containerRestarts:{}});
});

test('verifier summary distinguishes running incomplete and failed runs', () => {
  const now = new Date('2026-09-02T10:00:00Z');
  const summary = verifierSummary([{started:'2026-09-02T09:50:00Z'}, {started:'2026-09-02T08:00:00Z'}, {started:'2026-09-02T09:00:00Z',failed:true}, {started:'2026-09-02T07:00:00Z',ended:'2026-09-02T07:10:00Z',repairs:2}], now);
  assert.equal(summary.running, 1); assert.equal(summary.incomplete, 1); assert.equal(summary.failed, 1); assert.equal(summary.succeeded, 1);
});

test('queue activity and problem trends have separate semantics', () => {
  const base = { incidents:{active:[]}, queues:{sonarr:{total:1,failed:0,stalled:0},radarr:{},nzbdav:{}}, containers:[], mounts:{overall:'healthy'}, health:{sonarr:{reachable:true},radarr:{reachable:true}} };
  const older = metricPoint(base, new Date('2026-09-01T10:00:00Z')); const newer = metricPoint({...base,queues:{...base.queues,sonarr:{total:5,failed:0,stalled:0}}}, new Date('2026-09-02T10:00:00Z'));
  assert.equal(trend([older,newer], (point) => Object.values(point.queue).reduce((sum,item)=>sum+item.total,0)).direction, 'worse');
  assert.equal(trend([older,newer], (point) => point.problemScore).direction, 'stable');
  const problematic = metricPoint({...base,queues:{...base.queues,sonarr:{total:5,failed:1,stalled:0,rows:[{id:'x',state:'incident'}]}}}, new Date('2026-09-03T10:00:00Z'));
  assert.equal(trend([newer,problematic], (point) => point.problemScore).direction, 'worse');
  const recovered = metricPoint(base, new Date('2026-09-04T10:00:00Z'));
  assert.equal(trend([problematic,recovered], (point) => point.problemScore).direction, 'better');
  assert.equal(trend([older], (point) => point.problemScore).direction, 'unknown');
});
