import { TABS, calculateTabBadges, incidentTab, selectCriticalBanner, selectPrimaryAttention, tabFromHash } from './dashboard-ui.js';
import { getLocale, setLocale, t, translateDom } from './locales.js';

const state = { snapshot: null, incidentTab: 'active', logType: 'verifier', busy: false, pendingDetail: null };
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const number = (value) => value === null || value === undefined || !Number.isFinite(Number(value)) ? '–' : new Intl.NumberFormat('nl-NL').format(value);
const when = (value) => { if (!value) return 'Unknown'; const date = new Date(value); return Number.isNaN(+date) ? 'Unknown' : date.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }); };
const bytes = (value) => { let size = Number(value || 0); let unit = 0; const units = ['B', 'KB', 'MB', 'GB', 'TB']; while (size >= 1024 && unit < 4) { size /= 1024; unit += 1; } return `${size.toLocaleString('nl-NL', { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`; };
const label = (value) => ({ healthy: 'Healthy', degraded: 'Degraded', incident: 'Incident', unknown: 'Unknown', active: 'Active' })[value] || value || 'Unknown';

function safe(object, path, fallback = null) {
  return path.split('.').reduce((value, key) => value?.[key], object) ?? fallback;
}

function row(title, note, value, status = 'unknown', detail = '') {
  const tag = detail ? 'button' : 'div';
  return `<${tag} class="stack-row ${esc(status)}" ${detail ? `type="button" data-detail="${esc(detail)}"` : ''}><div class="copy"><strong>${esc(title)}</strong><p>${esc(note)}</p></div><span class="badge ${esc(status)}">${esc(value)}</span></${tag}>`;
}

function renderTabs() {
  const focusedTab = document.activeElement?.dataset?.mainTab;
  const active = tabFromHash(location.hash);
  const badges = calculateTabBadges(state.snapshot || {});
  $('mainTabs').innerHTML = TABS.map((tab) => {
    const selected = tab.id === active.id;
    const badge = badges[tab.id];
    const suffix = badge.count ? `, ${badge.count} actieve ${badge.severity === 'critical' ? 'problemen' : 'waarschuwingen'}` : '';
    return `<button id="tab-${tab.id}" class="main-tab${selected ? ' active' : ''}" type="button" role="tab" aria-selected="${selected}" aria-controls="${tab.panelId}" aria-label="${tab.label}${suffix}" tabindex="${selected ? 0 : -1}" data-main-tab="${tab.id}"><span>${tab.label}</span>${badge.count ? `<span class="tab-badge ${badge.severity}" aria-hidden="true">${badge.count}</span>` : ''}</button>`;
  }).join('');
  for (const tab of TABS) $(tab.panelId).hidden = tab.id !== active.id;
  requestAnimationFrame(() => { const button = document.getElementById(`tab-${active.id}`); button?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' }); if (focusedTab === active.id) button?.focus(); });
}

function activateTab(id, options = {}) {
  const tab = TABS.find((item) => item.id === id) || TABS[0];
  if (options.detail) state.pendingDetail = options.detail;
  if (location.hash !== tab.hash) location.hash = tab.hash;
  else {
    renderTabs();
    if (state.pendingDetail) { const detail = state.pendingDetail; state.pendingDetail = null; requestAnimationFrame(() => openDetail(detail)); }
  }
  if (options.closeModal !== false && $('detailModal').open) $('detailModal').close();
}

async function load(force = false) {
  $('refreshBtn').disabled = true;
  try {
    const response = await fetch(`/api/snapshot${force ? '?force=1' : ''}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.snapshot = await response.json();
    render();
  } catch (error) {
    $('lastUpdated').textContent = `Niet beschikbaar · ${error.message}`;
    $('headerStatus').className = 'badge incident';
    $('headerStatus').textContent = 'Offline';
    renderTabs();
  } finally { $('refreshBtn').disabled = false; }
}

function render() {
  const snapshot = state.snapshot;
  $('lastUpdated').textContent = `Bijgewerkt ${when(snapshot.generatedAt)}`;
  $('headerStatus').className = `badge ${safe(snapshot, 'overview.status', 'unknown')}`;
  $('headerStatus').textContent = label(safe(snapshot, 'overview.status', 'unknown'));
  renderTabs(); renderBanner(snapshot); summary(snapshot); recommendation(snapshot); incidents(snapshot); chain(snapshot); trends(snapshot);
  queues(snapshot); wanted(snapshot); repairs(snapshot); providers(snapshot); providerIncidents(snapshot); providerTrends(snapshot);
  containers(snapshot); systemChecks(snapshot); usage(snapshot); logs(snapshot); actions(snapshot);
}

function renderBanner(snapshot) {
  const banner = selectCriticalBanner(snapshot);
  $('criticalBanner').hidden = !banner;
  $('criticalBanner').innerHTML = banner ? `<button type="button" data-banner-tab="${banner.tab}" data-banner-detail="${banner.detail}"><span class="banner-icon" aria-hidden="true">!</span><span><strong>${esc(banner.title)}</strong><small>${esc(banner.source)} · ${esc(banner.advice)}</small></span><span aria-hidden="true">›</span></button>` : '';
}

function summary(snapshot) {
  const queues = ['sonarr', 'radarr', 'nzbdav'].reduce((sum, key) => sum + Number(safe(snapshot, `queues.${key}.total`, 0)), 0);
  const stuck = Number(safe(snapshot, 'overview.failedQueues', 0)) + Number(safe(snapshot, 'overview.stalledQueues', 0));
  const provider = (snapshot.providers || []).some((item) => item.status === 'degraded') ? 'degraded' : snapshot.providers?.length ? 'healthy' : 'unknown';
  const cards = [
    ['Algemene status', label(safe(snapshot, 'overview.status', 'unknown')), `${number(safe(snapshot, 'overview.activeProblems', 0))} actieve signalen`, safe(snapshot, 'overview.status', 'unknown'), 'overview', 'incidents'],
    ['Queue-items', number(queues), stuck ? `${stuck} stalled/failed` : queues ? 'Normale activiteit' : 'Queue is leeg', stuck ? 'degraded' : queues ? 'active' : 'healthy', 'downloads', 'queues'],
    ['Providerstatus', label(provider), snapshot.providers?.length ? `Afgeleid · ${snapshot.providers[0].period || 'expliciet meetvenster'}` : 'Onvoldoende gegevens', provider, 'providers', 'providers'],
    ['WebDAV-mount', label(safe(snapshot, 'mounts.overall', 'unknown')), `${number(safe(snapshot, 'mounts.maxLatencyMs'))} ms read-latency`, safe(snapshot, 'mounts.overall', 'unknown'), 'system', 'mount']
  ];
  $('summaryGrid').innerHTML = cards.map(([name, value, note, status, tab, detail]) => `<button class="status-card ${status}" type="button" data-goto-tab="${tab}" data-goto-detail="${detail}"><span class="badge ${status}">${label(status)}</span><span class="value">${esc(value)}</span><strong>${esc(name)}</strong><small>${esc(note)}</small><time>Laatste meting ${when(snapshot.generatedAt)}</time></button>`).join('');
}

function recommendation(snapshot) {
  const primary = selectPrimaryAttention(snapshot);
  $('recommendationTitle').textContent = primary?.title || 'No action needed';
  $('recommendationText').textContent = primary?.advice || 'Alle gecontroleerde onderdelen zijn rustig. Blijf de automatische metingen volgen.';
}

function incidents(snapshot) {
  document.querySelectorAll('[data-incident-tab]').forEach((button) => { const selected = button.dataset.incidentTab === state.incidentTab; button.classList.toggle('active', selected); button.setAttribute('aria-selected', selected); button.tabIndex = selected ? 0 : -1; });
  $('incidentList').setAttribute('aria-labelledby', `incident-tab-${state.incidentTab}`);
  const list = snapshot.incidents?.[state.incidentTab] || [];
  $('incidentList').innerHTML = list.length ? list.slice(0, 20).map((item) => row(item.title, `${item.advice || 'No advice'} · ${item.source || 'Unknown source'} · ${number(item.count)}× · laatst ${when(item.lastSeen)}`, item.active ? 'Active' : 'Resolved', item.active ? item.severity === 'critical' ? 'incident' : 'degraded' : 'healthy')).join('') : row(state.incidentTab === 'active' ? 'No active incidents' : 'No items', state.incidentTab === 'active' ? 'De keten heeft nu geen actieve log-afgeleide storing.' : snapshot.incidents?.rules || 'No history.', 'Clear', 'healthy');
}

function chain(snapshot) {
  $('chain').innerHTML = (snapshot.chain || []).map((node) => `<div class="chain-node ${esc(node.status || 'unknown')}"><span class="badge ${esc(node.status || 'unknown')}">${label(node.status)}</span><strong>${esc(node.label)}</strong><small>${node.latencyMs !== null && node.latencyMs !== undefined ? `${number(node.latencyMs)} ms` : node.problem ? esc(node.problem) : node.lastSuccess ? `OK ${when(node.lastSuccess)}` : 'No reliable check'}</small></div>`).join('') || row('No pipeline data', 'The media pipeline could not be built.', 'Unknown', 'unknown');
}

function spark(points, getter) {
  const values = (points || []).map(getter).map(Number).filter(Number.isFinite);
  if (values.length < 2) return '<p class="muted empty-chart">History wordt opgebouwd</p>';
  const low = Math.min(...values); const high = Math.max(...values); const range = high - low || 1;
  const polyline = values.map((value, index) => `${(index / (values.length - 1)) * 100},${58 - ((value - low) / range) * 52}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><polyline points="${polyline}"/></svg>`;
}

function trendCards(points, all, definitions) {
  return definitions.map(([name, getter]) => `<div class="trend-card"><div class="trend-head"><strong>${name}</strong><span class="muted">${number(getter(points.at(-1) || {}))}</span></div>${spark(points, getter)}<p class="muted">24 uur · ${all.length} samples in 7 dagen</p></div>`).join('');
}

function trends(snapshot) {
  const points = snapshot.history?.points24h || []; const all = snapshot.history?.points7d || [];
  $('trends').innerHTML = trendCards(points, all, [['Queueactiviteit (neutraal)', (point) => Object.values(point.queue || {}).reduce((sum, queue) => sum + Number(queue.total || 0), 0)], ['Probleemscore', (point) => point.problemScore], ['Mount latency', (point) => point.mount?.latencyMs]]);
  $('downloadTrends').innerHTML = trendCards(points, all, [['Queue totaal', (point) => Object.values(point.queue || {}).reduce((sum, queue) => sum + Number(queue.total || 0), 0)], ['Vastgelopen', (point) => Object.values(point.queue || {}).reduce((sum, queue) => sum + Number(queue.stalled || 0), 0)], ['Failed', (point) => Object.values(point.queue || {}).reduce((sum, queue) => sum + Number(queue.failed || 0), 0)]]);
  $('historyMeta').textContent = `Elke ${number(snapshot.history?.sampleMinutes)} min · ${number(snapshot.history?.retentionDays)} dagen retentie`;
}

function queues(snapshot) {
  $('queues').innerHTML = ['sonarr', 'radarr', 'nzbdav'].map((key) => { const queue = snapshot.queues?.[key] || {}; const status = !queue.ok ? 'unknown' : queue.failed ? 'incident' : queue.stalled ? 'degraded' : queue.total ? 'active' : 'healthy'; return row(key === 'nzbdav' ? 'InfiniDysk' : key[0].toUpperCase() + key.slice(1), queue.ok ? `${number(queue.active)} actief · ${number(queue.stalled)} stil · oudste ${number(queue.oldestMinutes || 0)} min` : 'Source unreachable', `${number(queue.total || 0)} items`, status, 'queues'); }).join('');
}

function wanted(snapshot) {
  const items = [['Sonarr missing', safe(snapshot, 'wanted.sonarr.missing')], ['Sonarr cutoff unmet', safe(snapshot, 'wanted.sonarr.cutoff')], ['Radarr missing', safe(snapshot, 'wanted.radarr.missing')], ['Radarr cutoff unmet', safe(snapshot, 'wanted.radarr.cutoff')]];
  $('wanted').innerHTML = items.map(([name, value]) => row(name, value === null ? 'Source unreachable' : value === 0 ? 'No backlog' : 'Monitored backlog; leeftijd niet beschikbaar', number(value), value === null ? 'unknown' : value === 0 ? 'healthy' : 'active')).join('');
}

function repairs(snapshot) {
  const repair = snapshot.repairs?.summary || {}; const counts = snapshot.periodic?.counts || {};
  const searches = ['sonarr_missing', 'sonarr_upgrade', 'radarr_missing', 'radarr_upgrade'].reduce((sum, key) => sum + Number(counts[key] || 0), 0);
  const verifierState = repair.failed ? 'incident' : repair.incomplete ? 'degraded' : repair.running ? 'active' : repair.runs ? 'healthy' : 'unknown';
  $('repairs').innerHTML = row('Verifier', `${number(repair.clean || 0)} schoon · ${number(repair.succeeded || 0)} met repairs · ${number(repair.running || 0)} actief · ${number(repair.incomplete || 0)} incompleet · ${number(repair.failed || 0)} mislukt`, `${number(repair.repairs || 0)} repairs`, verifierState, 'repairs') + row('Periodic searches', `${number(counts.radarr_missing_backoff || 0)} backoffs · huidige logsnapshot`, number(searches), searches ? 'active' : 'healthy');
}

function providers(snapshot) {
  $('providers').innerHTML = snapshot.providers?.length ? snapshot.providers.map((provider) => row(provider.name, `${number(provider.trips)} trips · ${number(provider.missingArticles)} missing articles · ${provider.period || 'unknown period'} · last trip ${when(provider.lastTrip)} · herstel ${when(provider.lastRecovery)}`, label(provider.status), provider.status, 'providers')).join('') : row('No provider data', 'Providers appear only when reliable log data is available.', 'Unknown', 'unknown');
}

function providerIncidents(snapshot) {
  const list = (snapshot.incidents?.active || []).filter((item) => incidentTab(item) === 'providers');
  $('providerIncidents').innerHTML = list.length ? list.map((item) => row(item.title, `${item.source || 'Unknown source'} · ${item.advice || 'No advice'} · laatst ${when(item.lastSeen)}`, label(item.severity === 'critical' ? 'incident' : 'degraded'), item.severity === 'critical' ? 'incident' : 'degraded')).join('') : row('No active provider incidents', 'Geen recente trips, timeouts of missing-articlewaarschuwingen.', 'Clear', 'healthy');
}

function providerTrends(snapshot) {
  const points = snapshot.history?.points24h || []; const all = snapshot.history?.points7d || [];
  const getter = (point) => ['provider-trip', 'single-provider', 'missing-articles'].reduce((sum, key) => sum + Number(point.incidents?.[key] || 0), 0);
  $('providerTrends').innerHTML = points.some((point) => getter(point) > 0) ? trendCards(points, all, [['Provider incidents', getter]]) : '<p class="muted">Nog onvoldoende betrouwbare providerhistorie voor een trend.</p>';
}

function containers(snapshot) {
  $('containers').innerHTML = (snapshot.containers || []).map((container) => { const status = !container.ok ? 'incident' : container.health && container.health !== 'healthy' ? 'degraded' : 'healthy'; return row(container.name, `Docker ${container.status || 'unknown'} · health ${container.health || 'niet ingesteld'} · gestart ${when(container.startedAt)}`, `${number(container.restartCount)} restarts`, status); }).join('') || row('No container data', 'Docker is unreachable of er zijn geen containers geconfigureerd.', 'Unknown', 'unknown');
}

function systemChecks(snapshot) {
  const healthRows = ['sonarr', 'radarr'].map((key) => { const health = snapshot.health?.[key] || {}; return row(`${key[0].toUpperCase() + key.slice(1)} API`, health.reachable ? `HTTP ${number(health.status)} · gecontroleerd ${when(health.checkedAt)}` : 'API unreachable', `${number(health.latencyMs)} ms`, health.reachable ? health.ok ? 'healthy' : 'degraded' : 'incident'); });
  const mountRows = Object.entries(snapshot.mounts?.checks || {}).map(([name, check]) => row(name, `${check.error || 'Read-test geslaagd'} · gecontroleerd ${when(check.checkedAt)} · laatst goed ${when(check.lastKnownGood)} · last fout ${when(check.lastFailure)} · ${number(check.consecutiveFailures || 0)} opeenvolgende fouten`, `${number(check.latencyMs)} ms`, check.status || 'unknown', 'mount'));
  $('systemChecks').innerHTML = [...healthRows, ...mountRows].join('') || row('No system checks', 'Optional source data is unavailable.', 'Unknown', 'unknown');
}

function usage(snapshot) {
  const periods = snapshot.usage?.periods || {};
  $('usage').innerHTML = [['Vandaag', periods.daily], ['Week', periods.weekly], ['Maand', periods.monthly], ['Jaar', periods.yearly], ['Dashboard totaal', periods.allTime]].map(([name, value]) => `<div class="usage-card"><span>${name}</span><strong>${bytes(value?.totalBytes)}</strong><span>in ${bytes(value?.rxBytes)} · uit ${bytes(value?.txBytes)}</span></div>`).join('');
}

function logs(snapshot) { $('logBox').textContent = (snapshot.logs?.[state.logType] || []).join('\n') || 'No log lines in this source.'; }

function actions(snapshot) {
  $('serviceLinks').innerHTML = Object.entries(snapshot.links || {}).map(([name, url]) => `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(name)}</a>`).join('') || '<span class="muted">No service links configured.</span>';
  const buttons = [['run-verifier', 'Verifier draaien'], ['run-periodic', 'Periodic search'], ['run-watchdog', 'Mountcontrole']];
  for (const container of snapshot.containers || []) buttons.push([`restart-container|${container.name}`, `Herstart ${container.name}`]);
  $('actions').innerHTML = buttons.map(([value, text]) => { const [action, target] = value.split('|'); return `<button type="button" data-action="${action}" data-target="${esc(target || '')}" data-confirm="${action === 'restart-container' || action === 'run-watchdog' ? 'Deze beheeractie uitvoeren?' : ''}">${esc(text)}</button>`; }).join('');
}

function openDetail(kind) {
  if (!state.snapshot) return;
  const snapshot = state.snapshot; const title = $('modalTitle'); let rows = [];
  title.textContent = ({ queues: 'Queue-details', mount: 'Mount read-tests', providers: 'Providers', repairs: 'Repairs', incidents: 'Incidents', trends: 'History' })[kind] || 'Statusdetails';
  if (kind === 'queues') for (const key of ['sonarr', 'radarr', 'nzbdav']) for (const item of snapshot.queues?.[key]?.records || snapshot.queues?.[key]?.rows || []) rows.push([key, item.state, item.title || '–', item.progress === null ? '–' : `${Math.round(item.progress)}%`, item.ageMinutes === null ? '–' : `${item.ageMinutes} min`, item.eta || '–']);
  else if (kind === 'mount') rows = Object.entries(snapshot.mounts?.checks || {}).map(([key, value]) => [key, label(value.status), `${number(value.latencyMs)} ms`, value.error || 'OK', when(value.checkedAt)]);
  else if (kind === 'providers') rows = (snapshot.providers || []).map((item) => [item.name, label(item.status), item.trips, item.missingArticles, item.source]);
  else if (kind === 'containers') rows = (snapshot.containers || []).map((item) => [item.name, item.status, item.health || 'geen healthcheck', `${number(item.restartCount)} restarts`, when(item.startedAt)]);
  else if (kind === 'incidents') rows = [...(snapshot.incidents?.active || []), ...(snapshot.incidents?.historical || [])].map((item) => [label(item.active ? 'incident' : 'healthy'), item.title, item.source, when(item.firstSeen), when(item.lastSeen), item.advice]);
  else if (kind === 'repairs') rows = (snapshot.repairs?.runs || []).map((run) => [when(run.started), `${number(run.repairs)} repairs`, `${number(run.streamChecks)} checks`, when(run.ended)]);
  $('modalBody').innerHTML = rows.length ? `<div class="table-scroll"><table class="detail-table"><tbody>${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="muted">No details available.</p>';
  $('detailModal').showModal();
}

async function runAction(action, target, confirmText) {
  if (state.busy || (confirmText && !confirm(confirmText))) return;
  state.busy = true; $('actionStatus').textContent = 'Actie wordt uitgevoerd…';
  try { const response = await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, target }) }); const value = await response.json(); $('actionStatus').textContent = value.message || value.error || (value.ok ? 'Gestart' : 'Mislukt'); if (value.ok) await load(true); }
  catch (error) { $('actionStatus').textContent = `Fout: ${error.message}`; }
  finally { state.busy = false; }
}

function handleTabKeydown(event) {
  const current = event.target.closest('[data-main-tab]'); if (!current) return;
  const index = TABS.findIndex((tab) => tab.id === current.dataset.mainTab); let next = index;
  if (event.key === 'ArrowRight') next = (index + 1) % TABS.length; else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = TABS.length - 1; else if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault(); const target = (event.key === 'Enter' || event.key === ' ') ? current.dataset.mainTab : TABS[next].id; activateTab(target); requestAnimationFrame(() => document.getElementById(`tab-${target}`)?.focus());
}

function handleIncidentTabKeydown(event) {
  const current = event.target.closest('[data-incident-tab]'); if (!current) return;
  const values = ['active', 'resolved', 'historical']; const index = values.indexOf(current.dataset.incidentTab); let next = index;
  if (event.key === 'ArrowRight') next = (index + 1) % values.length; else if (event.key === 'ArrowLeft') next = (index - 1 + values.length) % values.length; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = values.length - 1; else if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault(); state.incidentTab = ['Enter', ' '].includes(event.key) ? current.dataset.incidentTab : values[next]; incidents(state.snapshot); requestAnimationFrame(() => document.getElementById(`incident-tab-${state.incidentTab}`)?.focus());
}

function handleHashChange() {
  const active = tabFromHash(location.hash);
  if (location.hash.toLowerCase() !== active.hash) history.replaceState(null, '', active.hash);
  renderTabs();
  if (state.pendingDetail) { const detail = state.pendingDetail; state.pendingDetail = null; requestAnimationFrame(() => openDetail(detail)); }
}

$('themeSelect').value = localStorage.getItem('arr-theme') || 'auto';
$('localeSelect').value=getLocale(); translateDom();
$('localeSelect').addEventListener('change',(event)=>{setLocale(event.target.value);translateDom();if(state.snapshot)render(state.snapshot);});
$('openSettings')?.addEventListener('click',()=>{location.href='/setup';});
$('themeSelect').addEventListener('change', (event) => { document.documentElement.dataset.theme = event.target.value; localStorage.setItem('arr-theme', event.target.value); });
$('refreshBtn').addEventListener('click', () => load(true));
$('logSelect').addEventListener('change', (event) => { state.logType = event.target.value; if (state.snapshot) logs(state.snapshot); });
$('exportBtn').addEventListener('click', () => { if (!state.snapshot) return; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(state.snapshot, null, 2)], { type: 'application/json' })); link.download = `arr-health-${Date.now()}.json`; link.click(); URL.revokeObjectURL(link.href); });
$('mainTabs').addEventListener('keydown', handleTabKeydown);
$('incidentTabs').addEventListener('keydown', handleIncidentTabKeydown);
window.addEventListener('hashchange', handleHashChange);
document.addEventListener('click', (event) => {
  const mainTab = event.target.closest('[data-main-tab]'); if (mainTab) { activateTab(mainTab.dataset.mainTab); return; }
  const banner = event.target.closest('[data-banner-tab]'); if (banner) { activateTab(banner.dataset.bannerTab, { detail: banner.dataset.bannerDetail }); return; }
  const destination = event.target.closest('[data-goto-tab]'); if (destination) { activateTab(destination.dataset.gotoTab, { detail: destination.dataset.gotoDetail }); return; }
  const incidentButton = event.target.closest('[data-incident-tab]'); if (incidentButton) { state.incidentTab = incidentButton.dataset.incidentTab; incidents(state.snapshot); return; }
  const detail = event.target.closest('[data-detail]'); if (detail) { openDetail(detail.dataset.detail); return; }
  const action = event.target.closest('[data-action]'); if (action) runAction(action.dataset.action, action.dataset.target, action.dataset.confirm);
});
$('modalClose').addEventListener('click', () => $('detailModal').close());
handleHashChange(); load(true); setInterval(() => load(false), 60000);
