import crypto from 'node:crypto';

export const INCIDENT_TTLS = {
  'provider-trip': 60 * 60 * 1000,
  'single-provider': 2 * 60 * 60 * 1000,
  'missing-articles': 6 * 60 * 60 * 1000,
  'repair-action': 0,
  'import-stuck': 2 * 60 * 60 * 1000,
  'fallback-rescue': 0,
  'search-limit': 12 * 60 * 60 * 1000,
  'mount-watchdog': 60 * 60 * 1000,
  'corrupt-media': 6 * 60 * 60 * 1000,
  'queue-busy': 30 * 60 * 1000
};

export function parseLogTime(line, fallback) {
  const match = String(line).match(/^(\d{4}-\d{2}-\d{2}[T ][0-9:.+-]+Z?)/);
  const value = match ? match[1].replace(' ', 'T') : fallback;
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date(fallback).toISOString();
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
    if (!current) {
      grouped.set(key, { ...event, fingerprint: key, firstSeen: seenAt, lastSeen: seenAt, count: 1 });
      continue;
    }
    current.count += 1;
    if (seenAt < current.firstSeen) current.firstSeen = seenAt;
    if (seenAt > current.lastSeen) {
      current.lastSeen = seenAt;
      current.line = event.line;
    }
  }
  return [...grouped.values()].map((incident) => {
    const ttl = INCIDENT_TTLS[incident.id] ?? 60 * 60 * 1000;
    const active = ttl > 0 && now.getTime() - new Date(incident.lastSeen).getTime() <= ttl;
    return { ...incident, active, resolvedAt: active ? null : incident.lastSeen };
  }).sort((a, b) => Number(b.active) - Number(a.active) || severityWeight(b.severity) - severityWeight(a.severity) || new Date(b.lastSeen) - new Date(a.lastSeen));
}

export function classifyQueue(records, now = new Date(), staleMinutes = 30, failedMinutes = 120) {
  const rows = (records || []).map((record) => {
    const size = Number(record.size || 0);
    const sizeleft = Number(record.sizeleft ?? record.sizeLeft ?? 0);
    const progress = size > 0 ? Math.max(0, Math.min(100, ((size - sizeleft) / size) * 100)) : null;
    const added = record.added || record.addedOn || record.timeleft || null;
    const ageMinutes = added && !Number.isNaN(new Date(added).getTime()) ? Math.max(0, (now - new Date(added)) / 60000) : null;
    const statusText = `${record.status || ''} ${record.trackedDownloadStatus || ''} ${JSON.stringify(record.statusMessages || [])}`;
    const explicitFailure = /failed|error|warning|import blocked|downloadFailed/i.test(statusText);
    const stalled = !explicitFailure && ageMinutes !== null && ageMinutes >= staleMinutes && /completed|importPending|queued|paused/i.test(statusText);
    const critical = explicitFailure || (stalled && ageMinutes >= failedMinutes);
    const state = critical ? 'incident' : stalled ? 'degraded' : 'active';
    return {
      title: record.title || record.sourceTitle || record.filename || record.name || '',
      status: record.status || 'unknown', trackedDownloadStatus: record.trackedDownloadStatus || '',
      size, sizeleft, progress, ageMinutes: ageMinutes === null ? null : Math.round(ageMinutes),
      eta: record.timeleft || record.estimatedCompletionTime || null, messages: record.statusMessages || [], state
    };
  });
  rows.sort((a, b) => stateWeight(b.state) - stateWeight(a.state) || (b.ageMinutes || 0) - (a.ageMinutes || 0));
  return { rows, total: rows.length, active: rows.filter((r) => r.state === 'active').length, stalled: rows.filter((r) => r.state === 'degraded').length, failed: rows.filter((r) => r.state === 'incident').length, oldestMinutes: Math.max(0, ...rows.map((r) => r.ageMinutes || 0)) };
}

export function severityWeight(value) { return value === 'critical' ? 3 : value === 'warning' ? 2 : 1; }
function stateWeight(value) { return value === 'incident' ? 3 : value === 'degraded' ? 2 : 1; }

export function classifyOverview(snapshot) {
  const unknown = !snapshot.health?.sonarr?.reachable || !snapshot.health?.radarr?.reachable;
  const active = snapshot.incidents?.active || [];
  const failedQueues = ['sonarr', 'radarr', 'nzbdav'].reduce((n, key) => n + Number(snapshot.queues?.[key]?.failed || 0), 0);
  const stalledQueues = ['sonarr', 'radarr', 'nzbdav'].reduce((n, key) => n + Number(snapshot.queues?.[key]?.stalled || 0), 0);
  const mount = snapshot.mounts?.overall || 'unknown';
  const critical = active.some((i) => i.severity === 'critical') || failedQueues > 0 || mount === 'incident';
  const warning = active.some((i) => i.severity === 'warning') || stalledQueues > 0 || mount === 'degraded';
  return { status: critical ? 'incident' : warning ? 'degraded' : unknown ? 'unknown' : 'healthy', activeProblems: active.length, failedQueues, stalledQueues };
}

export function metricPoint(snapshot, at = new Date()) {
  const incidentCounts = {};
  for (const item of snapshot.incidents?.active || []) incidentCounts[item.id] = (incidentCounts[item.id] || 0) + 1;
  return {
    at: at.toISOString(),
    queue: Object.fromEntries(['sonarr', 'radarr', 'nzbdav'].map((key) => [key, { total: snapshot.queues?.[key]?.total || 0, stalled: snapshot.queues?.[key]?.stalled || 0, failed: snapshot.queues?.[key]?.failed || 0, oldestMinutes: snapshot.queues?.[key]?.oldestMinutes || 0 }])),
    wanted: { sonarrMissing: snapshot.wanted?.sonarr?.missing ?? null, sonarrCutoff: snapshot.wanted?.sonarr?.cutoff ?? null, radarrMissing: snapshot.wanted?.radarr?.missing ?? null, radarrCutoff: snapshot.wanted?.radarr?.cutoff ?? null },
    incidents: incidentCounts,
    repairs: snapshot.repairs?.summary || {},
    mount: { status: snapshot.mounts?.overall || 'unknown', latencyMs: snapshot.mounts?.maxLatencyMs ?? null },
    api: Object.fromEntries(['sonarr', 'radarr'].map((key) => [key, { reachable: Boolean(snapshot.health?.[key]?.reachable), latencyMs: snapshot.health?.[key]?.latencyMs ?? null }])),
    containers: { running: (snapshot.containers || []).filter((c) => c.ok).length, total: (snapshot.containers || []).length, restarts: (snapshot.containers || []).reduce((n, c) => n + Number(c.restartCount || 0), 0) }
  };
}

export function pruneHistory(points, now = new Date(), retentionDays = 90) {
  const cutoff = now.getTime() - retentionDays * 86400000;
  return (Array.isArray(points) ? points : []).filter((point) => new Date(point.at).getTime() >= cutoff).slice(-26000);
}

export function trend(points, selector) {
  const valid = (points || []).map((point) => ({ at: new Date(point.at).getTime(), value: Number(selector(point)) })).filter((p) => Number.isFinite(p.at) && Number.isFinite(p.value));
  if (valid.length < 2) return { delta: null, direction: 'unknown' };
  const latest = valid.at(-1); const target = latest.at - 86400000;
  const previous = valid.reduce((best, point) => Math.abs(point.at - target) < Math.abs((best?.at || 0) - target) ? point : best, null);
  if (!previous || previous === latest) return { delta: null, direction: 'unknown' };
  const delta = latest.value - previous.value;
  return { delta, direction: delta < 0 ? 'better' : delta > 0 ? 'worse' : 'stable' };
}
