import crypto from 'node:crypto';

export const INCIDENT_TTLS = {
  'provider-trip': 60 * 60 * 1000, 'provider-connection': 60 * 60 * 1000,
  'single-provider': 2 * 60 * 60 * 1000, 'missing-articles': 6 * 60 * 60 * 1000,
  'repair-action': 0, 'import-stuck': 2 * 60 * 60 * 1000, 'fallback-rescue': 0,
  'search-limit': 12 * 60 * 60 * 1000, 'mount-watchdog': 60 * 60 * 1000,
  'corrupt-media': 6 * 60 * 60 * 1000, 'queue-busy': 30 * 60 * 1000
};

export function parseLogTime(line, fallback) {
  const match = String(line).match(/^(\d{4}-\d{2}-\d{2}[T ][0-9:.+-]+Z?)/);
  const value = match ? match[1].replace(' ', 'T') : fallback;
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date(fallback || 0).toISOString();
}

export function fingerprint(parts) {
  return crypto.createHash('sha256').update(parts.map((part) => String(part || '')).join('|')).digest('hex').slice(0, 16);
}

export function buildIncidents(events, now = new Date()) {
  const grouped = new Map();
  for (const event of events || []) {
    const key = fingerprint([event.id, event.source, event.subject]);
    const seenAt = parseLogTime(event.line, event.observedAt || new Date(0));
    const current = grouped.get(key);
    if (!current) { grouped.set(key, { ...event, fingerprint: key, firstSeen: seenAt, lastSeen: seenAt, count: 1 }); continue; }
    current.count += 1;
    if (seenAt < current.firstSeen) current.firstSeen = seenAt;
    if (seenAt > current.lastSeen) { current.lastSeen = seenAt; current.line = event.line; }
  }
  return [...grouped.values()].map((incident) => {
    const ttl = INCIDENT_TTLS[incident.id] ?? 60 * 60 * 1000;
    const active = ttl > 0 && now.getTime() - new Date(incident.lastSeen).getTime() <= ttl;
    return { ...incident, active, resolvedAt: active ? null : incident.lastSeen };
  }).sort((a, b) => Number(b.active) - Number(a.active) || severityWeight(b.severity) - severityWeight(a.severity) || new Date(b.lastSeen) - new Date(a.lastSeen));
}

function absoluteTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function normalizeQueueRecord(record = {}, source = 'arr', now = new Date(), staleMinutes = 30, failedMinutes = 120) {
  const size = Number.isFinite(Number(record.size)) ? Number(record.size) : 0;
  const rawLeft = record.sizeleft ?? record.sizeLeft;
  const sizeleft = Number.isFinite(Number(rawLeft)) ? Number(rawLeft) : 0;
  const progress = size > 0 ? Math.max(0, Math.min(100, ((size - sizeleft) / size) * 100)) : null;
  const addedAt = absoluteTime(source === 'nzbdav' ? (record.addedAt || record.added || record.createdAt) : (record.added || record.addedOn));
  const ageMinutes = addedAt ? Math.max(0, Math.round((now.getTime() - new Date(addedAt).getTime()) / 60000)) : null;
  const status = String(record.status || 'unknown');
  const trackedDownloadStatus = String(record.trackedDownloadStatus || '');
  const messages = Array.isArray(record.statusMessages) ? record.statusMessages : Array.isArray(record.messages) ? record.messages : [];
  const statusText = `${status} ${trackedDownloadStatus} ${JSON.stringify(messages)}`;
  const explicitFailure = /failed|error|warning|import blocked|downloadFailed/i.test(statusText);
  const waitingForImport = /completed|importPending|queued|paused/i.test(statusText);
  const stalled = !explicitFailure && ageMinutes !== null && ageMinutes >= staleMinutes && waitingForImport;
  const critical = explicitFailure || (stalled && ageMinutes >= failedMinutes);
  const state = critical ? 'incident' : stalled ? 'degraded' : 'active';
  const rawId = record.id ?? record.queueId ?? record.nzo_id ?? record.nzoId;
  const title = String(record.title || record.sourceTitle || record.filename || record.name || '');
  const id = rawId === undefined || rawId === null || rawId === '' ? `anon-${fingerprint([source, title.trim().toLowerCase()])}` : String(rawId);
  return { id, title, status, trackedDownloadStatus, size, sizeleft, progress, addedAt, ageMinutes, eta: record.timeleft || record.estimatedCompletionTime || null, messages, state, phase: waitingForImport ? 'import' : 'download' };
}

export function classifyQueue(records, now = new Date(), staleMinutes = 30, failedMinutes = 120, source = 'arr') {
  const rows = (records || []).map((record) => normalizeQueueRecord(record, source, now, staleMinutes, failedMinutes));
  rows.sort((a, b) => stateWeight(b.state) - stateWeight(a.state) || (b.ageMinutes || 0) - (a.ageMinutes || 0));
  return { rows, total: rows.length, active: rows.filter((row) => row.state === 'active').length, stalled: rows.filter((row) => row.state === 'degraded').length, failed: rows.filter((row) => row.state === 'incident').length, oldestMinutes: Math.max(0, ...rows.map((row) => row.ageMinutes || 0)) };
}

export function incidentTab(incident = {}) {
  if (['provider-trip', 'provider-connection', 'single-provider', 'missing-articles'].includes(incident.id) || /provider|usenet/i.test(`${incident.area || ''} ${incident.source || ''}`)) return 'providers';
  if (['mount-read-check', 'mount-watchdog', 'api-unreachable', 'container-state', 'docker-unreachable'].includes(incident.id) || /mount|docker|api|container/i.test(`${incident.area || ''} ${incident.source || ''}`)) return 'system';
  if (/queue|import|search|repair/i.test(`${incident.id || ''} ${incident.area || ''} ${incident.source || ''}`)) return 'downloads';
  return 'overview';
}

function normalizedPoint(point) {
  return {
    key: String(point.key), type: point.type || 'incident', severity: point.severity === 'critical' ? 'critical' : 'warning',
    tab: point.tab || 'overview', title: point.title || 'Operationeel aandachtspunt', source: point.source || 'Dashboard',
    advice: point.advice || 'Controleer de betreffende service.', detail: point.detail || 'incidents',
    firstSeen: point.firstSeen || point.lastSeen || new Date().toISOString(), lastSeen: point.lastSeen || point.firstSeen || new Date().toISOString()
  };
}

export function buildAttentionItems(snapshot = {}, now = new Date()) {
  const points = [];
  for (const incident of snapshot.incidents?.active || []) points.push(normalizedPoint({ key: `incident:${incident.fingerprint || fingerprint([incident.id, incident.source, incident.subject])}`, type: incident.id, severity: incident.severity, tab: incidentTab(incident), title: incident.title, source: incident.source, advice: incident.advice, detail: incidentTab(incident) === 'providers' ? 'providers' : incidentTab(incident) === 'downloads' ? 'queues' : incident.id === 'mount-read-check' ? 'mount' : 'incidents', firstSeen: incident.firstSeen, lastSeen: incident.lastSeen }));
  for (const name of ['sonarr', 'radarr', 'nzbdav']) for (const row of snapshot.queues?.[name]?.rows || snapshot.queues?.[name]?.records || []) if (row.state === 'incident' || row.state === 'degraded') points.push(normalizedPoint({ key: `queue:${name}:${row.id || fingerprint([name, row.title])}`, type: row.state === 'incident' ? 'queue-failed' : 'queue-stalled', severity: row.state === 'incident' ? 'critical' : 'warning', tab: 'downloads', title: `${name === 'nzbdav' ? 'InfiniDysk' : name[0].toUpperCase() + name.slice(1)} queue ${row.state === 'incident' ? 'failed' : 'vastgelopen'}`, source: `${name} queue`, advice: row.state === 'incident' ? 'Open de queue-details en herstel of verwijder het mislukte item.' : 'Controleer voortgang en importstatus.', detail: 'queues', lastSeen: now.toISOString() }));
  for (const container of snapshot.docker?.reachable === false ? [] : snapshot.containers || []) {
    const stopped = !container.exists || !container.ok; const unhealthy = container.health === 'unhealthy'; const starting = container.health === 'starting';
    if (stopped || unhealthy || starting) points.push(normalizedPoint({ key: `container:${container.name}`, type: 'container-state', severity: stopped || unhealthy ? 'critical' : 'warning', tab: 'system', title: `${container.name} ${stopped ? 'is gestopt of ontbreekt' : unhealthy ? 'is unhealthy' : 'start nog op'}`, source: 'Docker', advice: 'Controleer de containerstatus en logs; herstart alleen als dat veilig is.', detail: 'containers', lastSeen: container.checkedAt || now.toISOString() }));
    if (container.restartIncreased) points.push(normalizedPoint({ key: `container-restart:${container.name}:${container.restartCount}`, type: 'container-restart', severity: 'warning', tab: 'system', title: `${container.name} is onverwacht herstart`, source: 'Docker restart count', advice: 'Controleer de containerlogs rond het herstartmoment.', detail: 'containers', lastSeen: container.checkedAt || now.toISOString() }));
  }
  if (snapshot.docker?.reachable === false) points.push(normalizedPoint({ key: 'docker:unreachable', type: 'docker-unreachable', severity: 'critical', tab: 'system', title: 'Docker is niet bereikbaar', source: 'Docker socket', advice: 'Controleer de Docker-socket en dashboardrechten.', detail: 'containers', lastSeen: now.toISOString() }));
  for (const [name, health] of Object.entries(snapshot.health || {})) if (health?.reachable === false && !points.some((point) => point.type === 'api-unreachable' && point.title.toLowerCase().includes(name))) points.push(normalizedPoint({ key: `api:${name}`, type: 'api-unreachable', severity: 'critical', tab: 'system', title: `${name[0].toUpperCase() + name.slice(1)} API niet bereikbaar`, source: 'Live API-check', advice: 'Controleer container, netwerk en API-configuratie.', detail: 'incidents', lastSeen: health.checkedAt || now.toISOString() }));
  for (const [name, check] of Object.entries(snapshot.mounts?.checks || {})) if (check.status === 'incident') points.push(normalizedPoint({ key: `mount:${name}`, type: 'mount-read-check', severity: 'critical', tab: 'system', title: `${name} mount niet leesbaar`, source: 'Live read-test', advice: 'Controleer rclone/InfiniDysk en voer daarna de mountcontrole uit.', detail: 'mount', lastSeen: check.checkedAt || now.toISOString() }));
  const verifier = snapshot.repairs?.summary || {};
  if (verifier.failed) points.push(normalizedPoint({ key:'verifier:failed', type:'verifier-failed', severity:'critical', tab:'downloads', title:'Verifier-run mislukt', source:'Integrity verifier', advice:'Controleer de verifierlog en herstel de oorzaak voordat een nieuwe run start.', detail:'repairs', lastSeen:now.toISOString() }));
  else if (verifier.incomplete) points.push(normalizedPoint({ key:'verifier:incomplete', type:'verifier-incomplete', severity:'warning', tab:'downloads', title:'Verifier-run bleef incompleet', source:'Integrity verifier', advice:'Controleer waarom de oudere verifier-run niet netjes afsloot.', detail:'repairs', lastSeen:now.toISOString() }));
  return [...new Map(points.map((point) => [point.key, point])).values()];
}

const IMPACT = { 'mount-read-check': 100, 'docker-unreachable': 95, 'container-state': 90, 'api-unreachable': 85, 'queue-failed': 80, 'provider-trip': 70, 'provider-connection': 70, 'queue-stalled': 50 };
export function selectAttentionItem(items = [], includeWarnings = true) {
  return [...items].filter((item) => includeWarnings || item.severity === 'critical').sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity) || (IMPACT[b.type] || 0) - (IMPACT[a.type] || 0) || new Date(a.firstSeen || 0) - new Date(b.firstSeen || 0) || new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0))[0] || null;
}

export function classifyOverview(snapshot = {}) {
  const items = snapshot.attentionItems || buildAttentionItems(snapshot);
  const essentialUnknown = Object.values(snapshot.health || {}).some((health) => health?.reachable === undefined) || snapshot.mounts?.overall === 'unknown' || snapshot.docker?.reachable === false;
  const critical = items.some((item) => item.severity === 'critical'); const warning = items.some((item) => item.severity === 'warning');
  return { status: critical ? 'incident' : warning ? 'degraded' : essentialUnknown ? 'unknown' : 'healthy', activeProblems: items.length, failedQueues: items.filter((item) => item.type === 'queue-failed').length, stalledQueues: items.filter((item) => item.type === 'queue-stalled').length };
}

export function verifierSummary(runs = [], now = new Date(), graceMinutes = 30) {
  const result = { runs: runs.length, succeeded: 0, clean: 0, failed: 0, incomplete: 0, running: 0, repairs: 0, period: `laatste ${runs.length} verifier-runs` };
  for (const run of runs) {
    result.repairs += Number(run.repairs || 0);
    if (run.failed || run.status === 'failed') { result.failed += 1; continue; }
    if (run.ended) { Number(run.repairs || 0) > 0 ? result.succeeded += 1 : result.clean += 1; continue; }
    const age = now.getTime() - new Date(run.started || 0).getTime();
    if (Number.isFinite(age) && age <= graceMinutes * 60000) result.running += 1; else result.incomplete += 1;
  }
  return result;
}

export function reconcileIncidentHistory(previous = [], current = [], now = new Date(), resolvedWindowHours = 72, retentionDays = 90) {
  const at = now.toISOString(); const map = new Map((previous || []).map((item) => [item.fingerprint, { ...item }])); const activeKeys = new Set();
  for (const item of current || []) {
    const key = item.fingerprint; if (!key) continue; activeKeys.add(key); const old = map.get(key);
    map.set(key, { fingerprint: key, id: item.id, title: item.title, severity: item.severity, area: item.area, source: item.source, firstSeen: old?.firstSeen || item.firstSeen || at, lastSeen: item.lastSeen || at, resolvedAt: null, count: Number(old?.count || 0) + Number(item.count || 1), active: true });
  }
  for (const [key, item] of map) if (item.active && !activeKeys.has(key)) map.set(key, { ...item, active: false, resolvedAt: at });
  const cutoff = now.getTime() - retentionDays * 86400000; const resolvedCutoff = now.getTime() - resolvedWindowHours * 3600000;
  const kept = [...map.values()].filter((item) => new Date(item.lastSeen || item.resolvedAt || 0).getTime() >= cutoff);
  return { entries: kept, active: kept.filter((item) => item.active), resolved: kept.filter((item) => !item.active && new Date(item.resolvedAt).getTime() >= resolvedCutoff), historical: kept.filter((item) => !item.active && new Date(item.resolvedAt).getTime() < resolvedCutoff) };
}

export function parseOperationalHistory(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
    return { version: 1, incidents: Array.isArray(value.incidents) ? value.incidents : [], mounts: value.mounts && typeof value.mounts === 'object' ? value.mounts : {}, containerRestarts: value.containerRestarts && typeof value.containerRestarts === 'object' ? value.containerRestarts : {} };
  } catch { return { version: 1, incidents: [], mounts: {}, containerRestarts: {} }; }
}

function providerName(value) {
  const text = String(value || '');
  if (/viper|news\.vipernews\.com/i.test(text)) return 'Viper';
  if (/sunny/i.test(text)) return 'Sunny';
  const quoted = text.match(/(?:Provider|Last error from)\s+["']([^"']+)["']/i)?.[1];
  const host = text.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i)?.[1];
  const plain = text.match(/Provider\s+([A-Za-z0-9._-]+)\s+(?:tripped|failed|timeout|connection)/i)?.[1];
  return (quoted || plain || host || '').replace(/[^A-Za-z0-9._ -]/g, '').slice(0, 80) || null;
}

export function deriveProviders(events = [], incidents = [], now = new Date(), windowHours = 24) {
  const cutoff = now.getTime() - windowHours * 3600000; const providers = new Map();
  for (const event of events) {
    const name = providerName(`${event.subject || ''} ${event.line || ''}`); if (!name) continue;
    const seenAt = parseLogTime(event.line, event.observedAt || new Date(0)); if (new Date(seenAt).getTime() < cutoff) continue;
    const current = providers.get(name) || { name, trips: 0, missingArticles: 0, lastTrip: null, lastRecovery: null };
    if (event.id === 'provider-trip' || event.id === 'provider-connection') { current.trips += 1; current.lastTrip = !current.lastTrip || seenAt > current.lastTrip ? seenAt : current.lastTrip; }
    if (event.id === 'missing-articles') current.missingArticles += 1;
    if (/recovered|connected|healthy|download (?:complete|succeeded)/i.test(event.line || '')) current.lastRecovery = !current.lastRecovery || seenAt > current.lastRecovery ? seenAt : current.lastRecovery;
    providers.set(name, current);
  }
  for (const incident of incidents) {
    const name = providerName(`${incident.subject || ''} ${incident.line || ''}`); if (!name) continue;
    if (!providers.has(name)) providers.set(name, { name, trips: 0, missingArticles: 0, lastTrip: null, lastRecovery: null });
  }
  return [...providers.values()].map((provider) => {
    const active = incidents.filter((incident) => incident.active && providerName(`${incident.subject || ''} ${incident.line || ''}`) === provider.name && ['provider-trip', 'provider-connection'].includes(incident.id));
    const severe = active.some((incident) => /login|auth|connection limit|TooManyRequests|DownloadLimitExceeded/i.test(incident.line || '') || incident.count >= 3);
    return { ...provider, status: severe ? 'incident' : active.length ? 'degraded' : 'healthy', source: 'afgeleid uit gelabelde loggebeurtenissen', period: `laatste ${windowHours} uur` };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function metricPoint(snapshot, at = new Date()) {
  const incidentCounts = {}; for (const item of snapshot.incidents?.active || []) incidentCounts[item.id] = (incidentCounts[item.id] || 0) + 1;
  const attention = snapshot.attentionItems || buildAttentionItems(snapshot, at);
  return { at: at.toISOString(), queue: Object.fromEntries(['sonarr', 'radarr', 'nzbdav'].map((key) => [key, { total: snapshot.queues?.[key]?.total || 0, stalled: snapshot.queues?.[key]?.stalled || 0, failed: snapshot.queues?.[key]?.failed || 0, oldestMinutes: snapshot.queues?.[key]?.oldestMinutes || 0 }])), wanted: { sonarrMissing: snapshot.wanted?.sonarr?.missing ?? null, sonarrCutoff: snapshot.wanted?.sonarr?.cutoff ?? null, radarrMissing: snapshot.wanted?.radarr?.missing ?? null, radarrCutoff: snapshot.wanted?.radarr?.cutoff ?? null }, incidents: incidentCounts, problemScore: attention.reduce((sum, item) => sum + (item.severity === 'critical' ? 3 : 1), 0), repairs: snapshot.repairs?.summary || {}, mount: { status: snapshot.mounts?.overall || 'unknown', latencyMs: snapshot.mounts?.maxLatencyMs ?? null }, api: Object.fromEntries(['sonarr', 'radarr'].map((key) => [key, { reachable: Boolean(snapshot.health?.[key]?.reachable), latencyMs: snapshot.health?.[key]?.latencyMs ?? null }])), containers: { running: (snapshot.containers || []).filter((container) => container.ok).length, total: (snapshot.containers || []).length, restarts: (snapshot.containers || []).reduce((sum, container) => sum + Number(container.restartCount || 0), 0), unhealthy: (snapshot.containers || []).filter((container) => !container.ok || container.health === 'unhealthy').length } };
}

export function pruneHistory(points, now = new Date(), retentionDays = 90) { const cutoff = now.getTime() - retentionDays * 86400000; return (Array.isArray(points) ? points : []).filter((point) => new Date(point.at).getTime() >= cutoff).slice(-26000); }
export function trend(points, selector) { const valid = (points || []).map((point) => ({ at: new Date(point.at).getTime(), value: Number(selector(point)) })).filter((point) => Number.isFinite(point.at) && Number.isFinite(point.value)); if (valid.length < 2) return { delta: null, direction: 'unknown' }; const latest = valid.at(-1); const target = latest.at - 86400000; const previous = valid.reduce((best, point) => Math.abs(point.at - target) < Math.abs((best?.at || 0) - target) ? point : best, null); if (!previous || previous === latest) return { delta: null, direction: 'unknown' }; const delta = latest.value - previous.value; return { delta, direction: delta < 0 ? 'better' : delta > 0 ? 'worse' : 'stable' }; }
export function severityWeight(value) { return value === 'critical' ? 3 : value === 'warning' ? 2 : 1; }
function stateWeight(value) { return value === 'incident' ? 3 : value === 'degraded' ? 2 : 1; }
