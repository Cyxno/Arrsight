export const TABS = Object.freeze([
  { id: 'overview', hash: '#overview', label: 'Overview', panelId: 'panel-overview' },
  { id: 'downloads', hash: '#downloads', label: 'Downloads', panelId: 'panel-downloads' },
  { id: 'providers', hash: '#providers', label: 'Providers', panelId: 'panel-providers' },
  { id: 'system', hash: '#system', label: 'System', panelId: 'panel-system' }
]);

export function tabFromHash(hash = '') { const normalized = String(hash || '').toLowerCase(); return TABS.find((tab) => tab.hash === normalized) || TABS[0]; }

export function incidentTab(incident = {}) {
  if (/provider|usenet|missing-articles/i.test(`${incident.id || ''} ${incident.area || ''} ${incident.source || ''}`)) return 'providers';
  if (/mount|docker|api|container/i.test(`${incident.id || ''} ${incident.area || ''} ${incident.source || ''}`)) return 'system';
  if (/queue|import|search|repair/i.test(`${incident.id || ''} ${incident.area || ''} ${incident.source || ''}`)) return 'downloads';
  return 'overview';
}

function fallbackItems(snapshot = {}) {
  const items = (snapshot.incidents?.active || []).map((incident) => ({ key: `incident:${incident.fingerprint || `${incident.id}:${incident.source}:${incident.title}`}`, type: incident.id || 'incident', severity: incident.severity === 'critical' ? 'critical' : 'warning', tab: incidentTab(incident), title: incident.title || 'Operational issue', source: incident.source || 'Dashboard', advice: incident.advice || 'Check the affected service.', detail: incident.detail || (incidentTab(incident) === 'providers' ? 'providers' : incidentTab(incident) === 'downloads' ? 'queues' : incident.id === 'mount-read-check' ? 'mount' : 'incidents'), firstSeen: incident.firstSeen, lastSeen: incident.lastSeen }));
  for (const name of ['sonarr', 'radarr', 'nzbdav']) {
    const queue = snapshot.queues?.[name] || {}; const rows = queue.rows || queue.records || [];
    for (const row of rows) if (['incident', 'degraded'].includes(row.state)) items.push({ key: `queue:${name}:${row.id || row.title}`, type: row.state === 'incident' ? 'queue-failed' : 'queue-stalled', severity: row.state === 'incident' ? 'critical' : 'warning', tab: 'downloads', title: `${name} queue ${row.state === 'incident' ? 'failed' : 'stalled'}`, source: `${name} queue`, advice: 'Open the queue details and check the item.', detail: 'queues', firstSeen: row.addedAt, lastSeen: snapshot.generatedAt });
    if (!rows.some((row) => ['incident', 'degraded'].includes(row.state))) {
      for (let index = 0; index < Number(queue.failed || 0); index += 1) items.push({ key:`queue:${name}:failed:${index}`, type:'queue-failed', severity:'critical', tab:'downloads', title:`${name} queue failed`, source:`${name} queue`, advice:'Open the queue details.', detail:'queues', lastSeen:snapshot.generatedAt });
      for (let index = 0; index < Number(queue.stalled || 0); index += 1) items.push({ key:`queue:${name}:stalled:${index}`, type:'queue-stalled', severity:'warning', tab:'downloads', title:`${name} queue stalled`, source:`${name} queue`, advice:'Check progress and import status.', detail:'queues', lastSeen:snapshot.generatedAt });
    }
  }
  for (const container of snapshot.containers || []) if (!container.ok || ['unhealthy', 'starting'].includes(container.health)) items.push({ key: `container:${container.name}`, type: 'container-state', severity: !container.ok || container.health === 'unhealthy' ? 'critical' : 'warning', tab: 'system', title: `${container.name} needs attention`, source: 'Docker', advice: 'Check container status and logs.', detail: 'containers', lastSeen: snapshot.generatedAt });
  return [...new Map(items.map((item) => [item.key, item])).values()];
}

export function attentionItems(snapshot = {}) { return Array.isArray(snapshot.attentionItems) ? snapshot.attentionItems : fallbackItems(snapshot); }

export function calculateTabBadges(snapshot = {}) {
  const all = attentionItems(snapshot); const result = {};
  for (const tab of TABS) { const items = tab.id === 'overview' ? all : all.filter((item) => item.tab === tab.id); result[tab.id] = { count: items.length, severity: items.some((item) => item.severity === 'critical') ? 'critical' : items.length ? 'warning' : null }; }
  return result;
}

const IMPACT = { 'mount-read-check':100, 'docker-unreachable':95, 'container-state':90, 'api-unreachable':85, 'queue-failed':80, 'provider-trip':70, 'provider-connection':70, 'queue-stalled':50 };
export function selectPrimaryAttention(snapshot = {}, includeWarnings = true) {
  return [...attentionItems(snapshot)].filter((item) => includeWarnings || item.severity === 'critical').sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical') || (IMPACT[b.type] || 0) - (IMPACT[a.type] || 0) || new Date(a.firstSeen || 0) - new Date(b.firstSeen || 0) || new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0))[0] || null;
}

export function selectCriticalBanner(snapshot = {}) { return selectPrimaryAttention(snapshot, false); }
