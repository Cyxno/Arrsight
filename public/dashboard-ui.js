export const TABS = Object.freeze([
  { id: 'overview', hash: '#overview', label: 'Overzicht', panelId: 'panel-overview' },
  { id: 'downloads', hash: '#downloads', label: 'Downloads', panelId: 'panel-downloads' },
  { id: 'providers', hash: '#providers', label: 'Providers', panelId: 'panel-providers' },
  { id: 'system', hash: '#system', label: 'Systeem', panelId: 'panel-system' }
]);

const PROVIDER_IDS = new Set(['provider-trip', 'single-provider', 'missing-articles']);
const DOWNLOAD_IDS = new Set(['import-stuck', 'search-limit', 'queue-busy']);
const SYSTEM_IDS = new Set(['mount-read-check', 'mount-watchdog', 'api-unreachable']);

export function tabFromHash(hash = '') {
  const normalized = String(hash || '').toLowerCase();
  return TABS.find((tab) => tab.hash === normalized) || TABS[0];
}

export function incidentTab(incident = {}) {
  if (PROVIDER_IDS.has(incident.id) || /provider|usenet/i.test(`${incident.area || ''} ${incident.source || ''}`)) return 'providers';
  if (SYSTEM_IDS.has(incident.id) || /mount|docker|api/i.test(`${incident.area || ''} ${incident.source || ''}`)) return 'system';
  if (DOWNLOAD_IDS.has(incident.id) || /queue|import|search|repair/i.test(`${incident.area || ''} ${incident.source || ''}`)) return 'downloads';
  return 'overview';
}

function unique(items) {
  return new Map(items.map((item) => [item.key, item])).values();
}

function severity(item) {
  return item.severity === 'critical' || item.status === 'incident' ? 'critical' : 'warning';
}

export function attentionItems(snapshot = {}) {
  const incidents = (snapshot.incidents?.active || []).map((incident) => ({
    key: incident.fingerprint || `${incident.id || 'incident'}:${incident.source || ''}:${incident.subject || incident.title || ''}`,
    severity: incident.severity || 'warning',
    tab: incidentTab(incident),
    incident
  }));
  const queues = ['sonarr', 'radarr', 'nzbdav'].flatMap((name) => {
    const queue = snapshot.queues?.[name] || {};
    return [
      ...Array.from({ length: Number(queue.failed || 0) }, (_, index) => ({ key: `queue:${name}:failed:${index}`, severity: 'critical', tab: 'downloads' })),
      ...Array.from({ length: Number(queue.stalled || 0) }, (_, index) => ({ key: `queue:${name}:stalled:${index}`, severity: 'warning', tab: 'downloads' }))
    ];
  });
  const containers = (snapshot.containers || []).filter((container) => !container.ok || (container.health && container.health !== 'healthy')).map((container) => ({ key: `container:${container.name}`, severity: !container.ok ? 'critical' : 'warning', tab: 'system' }));
  return [...unique([...incidents, ...queues, ...containers])];
}

export function calculateTabBadges(snapshot = {}) {
  const all = attentionItems(snapshot);
  const result = {};
  for (const tab of TABS) {
    const items = tab.id === 'overview' ? all : all.filter((item) => item.tab === tab.id);
    result[tab.id] = { count: items.length, severity: items.some((item) => severity(item) === 'critical') ? 'critical' : items.length ? 'warning' : null };
  }
  return result;
}

export function selectCriticalBanner(snapshot = {}) {
  const candidates = (snapshot.incidents?.active || []).filter((incident) => incident.severity === 'critical');
  candidates.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
  const incident = candidates[0];
  if (!incident) return null;
  const tab = incidentTab(incident);
  return { title: incident.title || 'Kritiek probleem', source: incident.source || incident.area || 'Onbekende bron', action: incident.advice || 'Open de details en controleer de geraakte service.', tab, detail: tab === 'providers' ? 'providers' : tab === 'downloads' ? 'queues' : incident.id === 'mount-read-check' ? 'mount' : 'incidents' };
}


