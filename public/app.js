const state = {
  snapshot: null,
  problemFilter: 'all',
  attentionFilter: 'all',
  logType: 'verifier',
  actionBusy: false
};

const $ = (id) => document.getElementById(id);

function statusClass(ok) {
  return ok ? 'good' : 'bad';
}

function number(value) {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('nl-NL').format(value);
}

function bytes(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let size = n;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = size >= 100 || unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: digits }).format(size)} ${units[unit]}`;
}

function shortTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadSnapshot(force = false) {
  $('refreshBtn').disabled = true;
  try {
    const response = await fetch(`/api/snapshot${force ? '?force=1' : ''}`);
    state.snapshot = await response.json();
    render();
  } catch (error) {
    $('lastUpdated').textContent = `Fout: ${error.message}`;
  } finally {
    $('refreshBtn').disabled = false;
  }
}

function render() {
  const s = state.snapshot;
  if (!s) return;

  $('lastUpdated').textContent = `Bijgewerkt ${shortTime(s.generatedAt)}`;
  renderSummary(s);
  renderUsage(s);
  renderServiceLinks(s);
  renderActions(s);
  renderAttention(s);
  renderProblems(s);
  renderWanted(s);
  renderQueues(s);
  renderProviders(s);
  renderRepairs(s);
  renderLogs(s);
}

function renderSummary(s) {
  const containerOk = s.containers.every((c) => c.ok);
  const arrOk = s.health.sonarr.ok && s.health.radarr.ok;
  const mountOk = s.mounts.nzbdav && s.mounts.tvRoot && s.mounts.movieRoot;
  const queueTotal = s.queues.sonarr.total + s.queues.radarr.total + s.queues.nzbdav.total;
  const problemTotal = s.problems.nzbdav.rawTotal ?? Object.values(s.problems.nzbdav.counts).reduce((a, b) => a + b, 0);
  const uniqueNzbDav = s.problems.nzbdav.uniqueTotal ?? 0;
  const repairTotal = s.repairs.runs.slice(-24).reduce((sum, run) => sum + (run.repairs || 0), 0);

  const cards = [
    { title: 'Containers', value: containerOk ? 'OK' : 'Check', ok: containerOk, foot: `${s.containers.filter((c) => c.ok).length}/${s.containers.length} running`, detail: 'containers' },
    { title: 'Arr Health', value: arrOk ? 'OK' : 'Check', ok: arrOk, foot: 'Sonarr + Radarr', detail: 'arrHealth' },
    { title: 'InfiniDysk mount', value: mountOk ? 'OK' : 'Check', ok: mountOk, foot: s.mounts.nzbdav ? 'mounted' : 'missing', detail: 'watchdog' },
    { title: 'Queues', value: number(queueTotal), ok: queueTotal === 0, foot: 'Sonarr/Radarr/InfiniDysk', detail: 'queues' },
    { title: 'InfiniDysk errors', value: number(problemTotal), ok: problemTotal === 0, foot: `${number(uniqueNzbDav)} unieke bestanden`, detail: 'nzbdavErrors' },
    { title: 'Vandaag verbruik', value: bytes(s.usage?.periods?.daily?.totalBytes), ok: true, foot: 'InfiniDysk network IO', detail: 'usage' },
    { title: 'Repairs', value: number(repairTotal), ok: repairTotal === 0, foot: 'laatste 24 runs', detail: 'repairs' },
    { title: 'Sonarr missing', value: number(s.wanted.sonarr.missing), ok: s.wanted.sonarr.missing === 0, foot: 'wanted', detail: 'wanted' },
    { title: 'Radarr missing', value: number(s.wanted.radarr.missing), ok: s.wanted.radarr.missing === 0, foot: 'wanted', detail: 'wanted' },
    { title: 'Bazarr providers', value: `${s.bazarr.providers.filter((p) => p.status === 'Good').length}/${s.bazarr.providers.length}`, ok: s.bazarr.providers.every((p) => p.status === 'Good'), foot: 'Good', detail: 'bazarr' },
    { title: 'Cutoff unmet', value: number((s.wanted.sonarr.cutoff || 0) + (s.wanted.radarr.cutoff || 0)), ok: false, foot: 'upgrade backlog', detail: 'wanted' }
  ];

  $('summaryGrid').innerHTML = cards.map((card) => `
    <button class="card card-button" type="button" data-detail="${escapeHtml(card.detail)}">
      <div class="card-title">
        <span>${escapeHtml(card.title)}</span>
        <span class="badge ${statusClass(card.ok)}">${card.ok ? 'OK' : 'INFO'}</span>
      </div>
      <div class="card-value ${card.ok ? 'good' : 'warn'}">${escapeHtml(card.value)}</div>
      <div class="card-foot">${escapeHtml(card.foot)}</div>
    </button>
  `).join('');
}

function renderUsage(s) {
  const usage = s.usage || {};
  const periods = usage.periods || {};
  const unattributed = usage.unattributed || {};
  const rows = [
    ['Vandaag', periods.daily],
    ['Deze week', periods.weekly],
    ['Deze maand', periods.monthly],
    ['Dit jaar', periods.yearly],
    ['All time', periods.allTime]
  ];
  $('usageGrid').innerHTML = rows.map(([label, row]) => `
    <button class="usage-card" type="button" data-detail="usage">
      <span>${escapeHtml(label)}</span>
      <strong>${bytes(row?.totalBytes)}</strong>
      <small>in ${bytes(row?.rxBytes)} / uit ${bytes(row?.txBytes)}</small>
    </button>
  `).join('');
  $('usageMeta').textContent = usage.samples
    ? `${number(usage.samples)} samples; lange gaten staan apart. Bron: ${usage.source}`
    : 'Meting start vanaf nu; eerste deltas verschijnen zodra InfiniDysk verkeer ziet.';
  if (unattributed.daily?.totalBytes) {
    $('usageMeta').textContent += ` Uitgesloten catch-up vandaag: ${bytes(unattributed.daily.totalBytes)}.`;
  }
}

function renderActions(s) {
  const containerOptions = s.containers.map((container) => `
    <button class="action-btn secondary" type="button" data-action="restart-container" data-target="${escapeHtml(container.name)}" data-confirm="Container ${escapeHtml(container.name)} herstarten?">
      ${escapeHtml(container.name)}
    </button>
  `).join('');

  $('actionGrid').innerHTML = `
    <div class="action-group">
      <h3>Repair</h3>
      <button class="action-btn primary" type="button" data-action="run-verifier">Integrity verifier nu draaien</button>
      <button class="action-btn secondary" type="button" data-action="run-watchdog">InfiniDysk mount herstellen</button>
      <button class="action-btn secondary" type="button" data-action="sonarr-refresh-downloads">Sonarr downloads verversen</button>
      <button class="action-btn secondary" type="button" data-action="radarr-refresh-downloads">Radarr downloads verversen</button>
    </div>
    <div class="action-group">
      <h3>Searches</h3>
      <button class="action-btn primary" type="button" data-action="run-periodic">Periodic search nu draaien</button>
      <button class="action-btn secondary" type="button" data-action="sonarr-rss-sync">Sonarr RSS sync</button>
      <button class="action-btn secondary" type="button" data-action="radarr-rss-sync">Radarr RSS sync</button>
      <button class="action-btn secondary" type="button" data-action="sonarr-missing-search">Sonarr missing zoeken</button>
      <button class="action-btn secondary" type="button" data-action="sonarr-cutoff-search">Sonarr upgrades zoeken</button>
      <button class="action-btn secondary" type="button" data-action="radarr-missing-search">Radarr missing zoeken</button>
      <button class="action-btn secondary" type="button" data-action="radarr-cutoff-search">Radarr upgrades zoeken</button>
    </div>
    <div class="action-group">
      <h3>Containers</h3>
      <div class="button-wrap">${containerOptions}</div>
    </div>
  `;
}

function renderServiceLinks(s) {
  const labels = {
    sonarr: 'Sonarr',
    radarr: 'Radarr',
    bazarr: 'Bazarr',
    nzbdav: 'InfiniDysk',
    plex: 'Plex',
    seerr: 'Seerr'
  };
  $('serviceLinks').innerHTML = Object.entries(s.links || {}).map(([key, url]) => `
    <a class="service-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">
      <span>${escapeHtml(labels[key] || key)}</span>
      <strong>Open</strong>
    </a>
  `).join('');
}

function renderAttention(s) {
  const attention = s.attention || { counts: {}, watchlist: [] };
  const counts = attention.counts || {};
  const total = attention.total || 0;
  const filter = state.attentionFilter;
  const rows = (attention.watchlist || [])
    .filter((event) => filter === 'all' || event.severity === filter)
    .slice(0, 18);

  $('attentionSummary').innerHTML = [
    ['Kritiek', counts.critical || 0, 'critical'],
    ['Waarschuwingen', counts.warning || 0, 'warning'],
    ['Info', counts.info || 0, 'info'],
    ['Unieke signalen', total, 'all']
  ].map(([label, value, severity]) => `
    <button class="attention-pill" type="button" data-attention-filter="${escapeHtml(severity)}">
      <span>${escapeHtml(label)}</span>
      <strong class="${attentionClass(severity)}">${number(value)}</strong>
    </button>
  `).join('');

  $('attentionRows').innerHTML = rows.length ? rows.map((event) => `
    <button class="attention-card" type="button" data-attention-detail="${escapeHtml(event.id)}" data-attention-source="${escapeHtml(event.source)}" data-attention-subject="${escapeHtml(event.subject)}">
      <div class="attention-card-head">
        <span class="badge ${attentionClass(event.severity)}">${escapeHtml(attentionLabel(event.severity))}</span>
        <span class="attention-source">${escapeHtml(event.source)}</span>
      </div>
      <strong>${escapeHtml(event.title)}</strong>
      <span>${escapeHtml(event.area)} · ${number(event.count || 1)}x</span>
      <p>${escapeHtml(event.subject)}</p>
      <small>${escapeHtml(event.advice)}</small>
    </button>
  `).join('') : '<div class="muted">Geen signalen in deze selectie.</div>';
}

function attentionClass(severity) {
  if (severity === 'critical') return 'bad';
  if (severity === 'warning') return 'warn';
  if (severity === 'all') return 'info';
  return 'info';
}

function attentionLabel(severity) {
  if (severity === 'critical') return 'Kritiek';
  if (severity === 'warning') return 'Let op';
  return 'Info';
}

function renderProblems(s) {
  const counts = { ...s.problems.nzbdav.counts, ...mergeCounts(s.problems.bazarr.counts) };
  const uniqueNzbDav = s.problems.nzbdav.uniqueTotal ?? 0;
  const rawNzbDav = s.problems.nzbdav.rawTotal ?? 0;
  const labels = {
    missingArticles: 'Missing articles',
    notFound: '404 / not found',
    timeout: 'Timeouts',
    stuck: 'Stuck opgelost',
    pathMissing: 'Path missing',
    providerLimit: 'Provider limits',
    corruptStream: 'Corrupt stream'
  };

  $('problemCounts').innerHTML = Object.entries(labels).map(([key, label]) => `
    <button class="metric metric-button" type="button" data-problem-filter="${escapeHtml(key)}">
      <span>${label}</span>
      <strong>${number(counts[key] || 0)}</strong>
    </button>
  `).join('') + `
    <button class="metric metric-button highlight" type="button" data-detail="nzbdavUnique">
      <span>InfiniDysk uniek</span>
      <strong>${number(uniqueNzbDav)}</strong>
    </button>
    <button class="metric metric-button" type="button" data-detail="nzbdavErrors">
      <span>InfiniDysk logregels</span>
      <strong>${number(rawNzbDav)}</strong>
    </button>
  `;

  const filter = state.problemFilter;
  const rows = s.problems.recent
    .filter((p) => filter === 'all' || p.type === filter)
    .slice(-100)
    .reverse();

  $('problemRows').innerHTML = rows.length ? rows.map((p) => `
    <tr>
      <td><span class="badge ${problemBadge(p.type)}">${escapeHtml(labels[p.type] || p.type)}</span></td>
      <td>${escapeHtml(p.title)}</td>
      <td class="mono">${escapeHtml(p.line)}</td>
    </tr>
  `).join('') : '<tr><td colspan="3" class="muted">Geen problemen in deze selectie.</td></tr>';
}

function exportSnapshot() {
  const s = state.snapshot;
  if (!s) return;
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  link.href = url;
  link.download = `arr-monitoring-snapshot-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function mergeCounts(counts) {
  return counts || {};
}

function problemBadge(type) {
  if (type === 'missingArticles' || type === 'notFound') return 'bad';
  if (type === 'timeout' || type === 'providerLimit') return 'warn';
  return 'info';
}

function renderWanted(s) {
  const rows = [
    ['Sonarr missing', s.wanted.sonarr.missing, 'Episodes zonder file'],
    ['Sonarr cutoff', s.wanted.sonarr.cutoff, 'Episodes onder cutoff'],
    ['Radarr missing', s.wanted.radarr.missing, 'Films zonder file'],
    ['Radarr cutoff', s.wanted.radarr.cutoff, 'Films onder cutoff']
  ];
  $('wantedGrid').innerHTML = rows.map(([name, value, note]) => item(name, number(value), note, value ? 'warn' : 'good')).join('');
}

function renderQueues(s) {
  const rows = [
    ['Sonarr', s.queues.sonarr.total, formatStatuses(s.queues.sonarr.byStatus)],
    ['Radarr', s.queues.radarr.total, formatStatuses(s.queues.radarr.byStatus)],
    ['InfiniDysk', s.queues.nzbdav.total, formatStatuses(s.queues.nzbdav.byStatus)]
  ];
  $('queueGrid').innerHTML = rows.map(([name, value, note]) => item(name, number(value), note || 'Leeg', value ? 'warn' : 'good')).join('');
}

function renderProviders(s) {
  $('providerGrid').innerHTML = s.bazarr.providers.map((provider) => {
    const ok = provider.status === 'Good';
    const note = provider.retry && provider.retry !== '-' ? provider.retry : provider.status;
    return item(provider.name, provider.status, note, ok ? 'good' : 'warn');
  }).join('');
}

function renderRepairs(s) {
  const verifierRuns = s.repairs.runs.slice(-12);
  const periodicRuns = (s.periodic.runs || []).slice(-8);
  const lastVerifier = verifierRuns.at(-1) || {};
  const repairs24 = s.repairs.runs.slice(-24).reduce((sum, run) => sum + (run.repairs || 0), 0);
  const deferred24 = s.repairs.runs.slice(-24).reduce((sum, run) => sum + (run.deferred || 0), 0);
  const backoffRecent = s.periodic.counts?.radarr_missing_backoff || 0;
  const searchRecent = ['sonarr_missing', 'sonarr_upgrade', 'radarr_missing', 'radarr_upgrade']
    .reduce((sum, key) => sum + (s.periodic.counts?.[key] || 0), 0);

  const timeline = [
    ...verifierRuns.map((run) => ({
      kind: 'Verifier',
      at: run.ended || run.started,
      status: run.repairs ? 'Repair' : (run.deferred ? 'Wacht' : 'OK'),
      badge: run.repairs ? 'bad' : (run.deferred ? 'warn' : 'good'),
      summary: `${number(run.repairs || 0)} repair, ${number(run.streamChecks || 0)} checks`,
      note: [
        run.deferred ? `${number(run.deferred)} deferred` : '',
        run.confirmedMissing ? `${number(run.confirmedMissing)} confirmed missing` : '',
        run.unmapped ? `${number(run.unmapped)} unmapped logregels` : ''
      ].filter(Boolean).join(', ') || 'routinecheck'
    })),
    ...periodicRuns.map((run) => ({
      kind: 'Periodic',
      at: run.ended || run.started,
      status: run.skipped ? 'Skip' : (run.radarr_missing_backoff ? 'Backoff' : 'Search'),
      badge: run.skipped ? 'warn' : (run.radarr_missing_backoff ? 'info' : 'good'),
      summary: `${number((run.sonarr_missing || 0) + (run.radarr_missing || 0))} missing, ${number((run.sonarr_upgrade || 0) + (run.radarr_upgrade || 0))} upgrades`,
      note: [
        run.radarr_missing_backoff ? `${number(run.radarr_missing_backoff)} Radarr backoff` : '',
        run.radarr_blocklist_retry_delete ? `${number(run.radarr_blocklist_retry_delete)} blocklist retries` : ''
      ].filter(Boolean).join(', ') || 'normale search'
    }))
  ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 14);

  $('repairBars').innerHTML = `
    <div class="repair-stats">
      ${repairStat('Laatste verifier', lastVerifier.repairs ? `${number(lastVerifier.repairs)} repair` : 'OK', `${number(lastVerifier.streamChecks || 0)} streamchecks`, lastVerifier.repairs ? 'bad' : 'good')}
      ${repairStat('Repairs 24 runs', number(repairs24), 'echte deletes/searches', repairs24 ? 'bad' : 'good')}
      ${repairStat('Deferred missing', number(deferred24), 'wacht op bevestiging', deferred24 ? 'warn' : 'good')}
      ${repairStat('Radarr backoff', number(backoffRecent), 'slechte releases overgeslagen', backoffRecent ? 'info' : 'good')}
      ${repairStat('Search acties', number(searchRecent), 'periodic log snapshot', searchRecent ? 'info' : 'good')}
    </div>
    <div class="table-wrap compact">
      <table>
        <thead>
          <tr>
            <th>Tijd</th>
            <th>Proces</th>
            <th>Status</th>
            <th>Samenvatting</th>
            <th>Notitie</th>
          </tr>
        </thead>
        <tbody>
          ${timeline.map((row) => `
            <tr>
              <td>${escapeHtml(shortTime(row.at))}</td>
              <td>${escapeHtml(row.kind)}</td>
              <td><span class="badge ${row.badge}">${escapeHtml(row.status)}</span></td>
              <td>${escapeHtml(row.summary)}</td>
              <td class="mono">${escapeHtml(row.note)}</td>
            </tr>
          `).join('') || '<tr><td colspan="5" class="muted">Nog geen runs gevonden.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  const repairs = s.repairs.repairs.slice(-40).reverse();
  $('repairRows').innerHTML = repairs.length ? repairs.map((repair) => `
    <tr>
      <td>${escapeHtml(repair.app)}</td>
      <td><span class="badge bad">${escapeHtml(repair.reason)}</span></td>
      <td class="mono">${escapeHtml(repair.path)}</td>
    </tr>
  `).join('') : '<tr><td colspan="3" class="muted">Geen recente repairs.</td></tr>';
}

function repairStat(label, value, note, badgeClass) {
  return `
    <div class="repair-stat">
      <span>${escapeHtml(label)}</span>
      <strong class="${escapeHtml(badgeClass)}">${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </div>
  `;
}

function renderLogs(s) {
  const lines = s.logs[state.logType] || [];
  $('logBox').textContent = lines.join('\n') || 'Geen logregels gevonden.';
}

async function runDashboardAction(action, target, confirmText) {
  if (state.actionBusy) return;
  if (confirmText && !window.confirm(confirmText)) return;
  state.actionBusy = true;
  $('actionStatus').textContent = 'Actie loopt...';
  document.querySelectorAll('.action-btn').forEach((button) => { button.disabled = true; });
  try {
    const response = await fetch('/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, target })
    });
    const result = await response.json();
    $('actionStatus').textContent = result.ok
      ? (result.queued ? 'Actie queued, runner pakt hem zo op' : (result.message || 'Actie gestart'))
      : (result.error || result.message || 'Actie mislukt');
    await loadSnapshot(true);
  } catch (error) {
    $('actionStatus').textContent = `Fout: ${error.message}`;
  } finally {
    state.actionBusy = false;
    document.querySelectorAll('.action-btn').forEach((button) => { button.disabled = false; });
  }
}

function openDetail(kind, filter = 'all') {
  const s = state.snapshot;
  if (!s) return;
  const labels = {
    missingArticles: 'Missing articles',
    notFound: '404 / not found',
    timeout: 'Timeouts',
    stuck: 'Stuck opgelost',
    pathMissing: 'Path missing',
    providerLimit: 'Provider limits'
  };
  const modal = $('detailModal');
  const title = $('modalTitle');
  const subtitle = $('modalSubtitle');
  const body = $('modalBody');

  if (kind === 'nzbdavErrors' || kind === 'nzbdavUnique') {
    const problems = s.problems.nzbdav.problems.filter((p) => filter === 'all' || p.type === filter);
    const unique = s.problems.nzbdav.uniqueProblems.filter((p) => filter === 'all' || p.type === filter);
    title.textContent = kind === 'nzbdavUnique' ? 'InfiniDysk unieke fouten' : 'InfiniDysk errors';
    subtitle.textContent = `${number(problems.length)} logregels in snapshot, ${number(unique.length)} unieke objecten zichtbaar.`;
    body.innerHTML = `
      <h3>Uniek</h3>
      ${detailTable(unique.map((p) => [labels[p.type] || p.type, `${p.count}x`, p.title, p.line]))}
      <h3>Ruwe logregels</h3>
      ${detailTable(problems.slice().reverse().map((p) => [labels[p.type] || p.type, '', p.title, p.line]))}
    `;
  } else if (kind === 'containers') {
    title.textContent = 'Containers';
    subtitle.textContent = 'Status van de mediastack containers.';
    body.innerHTML = detailTable(s.containers.map((c) => [c.name, c.status, c.health || '-', c.startedAt || '-']));
  } else if (kind === 'queues') {
    title.textContent = 'Queues';
    subtitle.textContent = 'Huidige Sonarr, Radarr en InfiniDysk activiteit.';
    const rows = [
      ...s.queues.sonarr.records.map((r) => ['Sonarr', r.status, r.title, JSON.stringify(r.messages || [])]),
      ...s.queues.radarr.records.map((r) => ['Radarr', r.status, r.title, JSON.stringify(r.messages || [])]),
      ...s.queues.nzbdav.rows.map((r) => ['InfiniDysk', r.status || '-', r.filename || r.name || '-', JSON.stringify(r)])
    ];
    body.innerHTML = rows.length ? detailTable(rows) : '<p class="muted">Geen queue-items.</p>';
  } else if (kind === 'repairs') {
    title.textContent = 'Repairs';
    subtitle.textContent = 'Laatste integrity-verifier repairs.';
    body.innerHTML = detailTable(s.repairs.repairs.slice().reverse().map((r) => [r.app, r.reason, r.path]));
  } else if (kind === 'usage') {
    const usage = s.usage || {};
    const periods = usage.periods || {};
    const unattributed = usage.unattributed || {};
    title.textContent = 'InfiniDysk dataverbruik';
    subtitle.textContent = 'Docker netwerk-IO van InfiniDysk. Dit omvat usenet ophalen, imports, verifier read-tests en streaming; het is geen pure Plex-kijkteller.';
    body.innerHTML = `
      ${detailTable([
        ['Vandaag', bytes(periods.daily?.totalBytes), `in ${bytes(periods.daily?.rxBytes)}`, `uit ${bytes(periods.daily?.txBytes)}`],
        ['Deze week', bytes(periods.weekly?.totalBytes), `in ${bytes(periods.weekly?.rxBytes)}`, `uit ${bytes(periods.weekly?.txBytes)}`],
        ['Deze maand', bytes(periods.monthly?.totalBytes), `in ${bytes(periods.monthly?.rxBytes)}`, `uit ${bytes(periods.monthly?.txBytes)}`],
        ['Dit jaar', bytes(periods.yearly?.totalBytes), `in ${bytes(periods.yearly?.rxBytes)}`, `uit ${bytes(periods.yearly?.txBytes)}`],
        ['All time dashboard', bytes(periods.allTime?.totalBytes), `in ${bytes(periods.allTime?.rxBytes)}`, `uit ${bytes(periods.allTime?.txBytes)}`],
        ['Container sinds start', bytes(usage.currentCounters?.totalBytes), `in ${bytes(usage.currentCounters?.rxBytes)}`, `uit ${bytes(usage.currentCounters?.txBytes)}`]
      ])}
      <p class="muted">Samples met meer dan ${number(usage.maxAttributionMinutes || 15)} minuten ertussen worden als catch-up gemarkeerd en niet in de periode-totalen meegeteld.</p>
      <h3>Uitgesloten catch-up</h3>
      ${detailTable([
        ['Vandaag', bytes(unattributed.daily?.totalBytes), `in ${bytes(unattributed.daily?.rxBytes)}`, `uit ${bytes(unattributed.daily?.txBytes)}`],
        ['Deze week', bytes(unattributed.weekly?.totalBytes), `in ${bytes(unattributed.weekly?.rxBytes)}`, `uit ${bytes(unattributed.weekly?.txBytes)}`],
        ['All time', bytes(unattributed.allTime?.totalBytes), `in ${bytes(unattributed.allTime?.rxBytes)}`, `uit ${bytes(unattributed.allTime?.txBytes)}`]
      ])}
      <h3>Recent</h3>
      ${detailTable((usage.recent || []).slice().reverse().map((r) => [
        shortTime(r.at),
        bytes(r.totalDelta),
        `in ${bytes(r.rxDelta)}`,
        `uit ${bytes(r.txDelta)}`,
        r.attributed === false ? `catch-up (${number(r.gapSeconds || 0)}s)` : 'meegeteld'
      ]))}
    `;
  } else if (kind === 'wanted') {
    title.textContent = 'Wanted';
    subtitle.textContent = 'Ontbrekend en cutoff unmet.';
    body.innerHTML = detailTable([
      ['Sonarr missing', number(s.wanted.sonarr.missing), 'episodes zonder file'],
      ['Sonarr cutoff', number(s.wanted.sonarr.cutoff), 'episodes onder cutoff'],
      ['Radarr missing', number(s.wanted.radarr.missing), 'films zonder file'],
      ['Radarr cutoff', number(s.wanted.radarr.cutoff), 'films onder cutoff']
    ]);
  } else if (kind === 'bazarr') {
    title.textContent = 'Bazarr providers';
    subtitle.textContent = 'Subtitle provider status.';
    body.innerHTML = detailTable(s.bazarr.providers.map((p) => [p.name, p.status, p.retry || '-', p.message || '-']));
  } else if (kind === 'watchdog') {
    title.textContent = 'InfiniDysk mount';
    subtitle.textContent = 'Mount en watchdog log.';
    body.innerHTML = `<pre class="logbox">${escapeHtml((s.logs.watchdog || []).join('\n') || 'Geen watchdog logregels.')}</pre>`;
  } else if (kind === 'attention') {
    const filter = arguments[1] || 'all';
    const events = (s.attention?.recent || []).filter((event) => filter === 'all' || event.severity === filter || event.id === filter);
    const watchlist = (s.attention?.watchlist || []).filter((event) => filter === 'all' || event.severity === filter || event.id === filter);
    title.textContent = 'Waar op letten';
    subtitle.textContent = `${number(events.length)} recente logregels, ${number(s.attention?.rawTotal || 0)} ruwe matches in deze snapshot.`;
    body.innerHTML = `
      <h3>Gegroepeerd</h3>
      ${detailTable(watchlist.map((event) => [
        attentionLabel(event.severity),
        `${event.count || 1}x`,
        event.source,
        event.title,
        event.subject,
        event.advice
      ]))}
      <h3>Ruwe logregels</h3>
      ${detailTable(events.slice().reverse().map((event) => [
        attentionLabel(event.severity),
        event.source,
        event.title,
        event.subject,
        event.line
      ]))}
    `;
  } else {
    title.textContent = 'Arr Health';
    subtitle.textContent = 'Sonarr en Radarr health.';
    body.innerHTML = detailTable([
      ['Sonarr', s.health.sonarr.ok ? 'OK' : 'Check', JSON.stringify(s.health.sonarr.data || [])],
      ['Radarr', s.health.radarr.ok ? 'OK' : 'Check', JSON.stringify(s.health.radarr.data || [])]
    ]);
  }

  modal.showModal();
}

function detailTable(rows) {
  if (!rows.length) return '<p class="muted">Geen regels gevonden.</p>';
  return `
    <div class="table-wrap modal-table">
      <table>
        <tbody>
          ${rows.map((row) => `
            <tr>${row.map((cell) => `<td class="mono">${escapeHtml(cell)}</td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function item(name, value, note, badgeClass) {
  return `
    <div class="item">
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(note)}</span>
      </div>
      <span class="badge ${badgeClass}">${escapeHtml(value)}</span>
    </div>
  `;
}

function formatStatuses(statuses) {
  const entries = Object.entries(statuses || {});
  if (!entries.length) return '';
  return entries.map(([key, value]) => `${key}: ${value}`).join(', ');
}

$('refreshBtn').addEventListener('click', () => loadSnapshot(true));
$('exportBtn').addEventListener('click', exportSnapshot);
$('summaryGrid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-detail]');
  if (button) openDetail(button.dataset.detail);
});
$('actionGrid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  runDashboardAction(button.dataset.action, button.dataset.target || null, button.dataset.confirm || '');
});
$('problemCounts').addEventListener('click', (event) => {
  const filterButton = event.target.closest('[data-problem-filter]');
  if (filterButton) openDetail('nzbdavErrors', filterButton.dataset.problemFilter);
  const detailButton = event.target.closest('[data-detail]');
  if (detailButton) openDetail(detailButton.dataset.detail);
});
$('attentionSummary').addEventListener('click', (event) => {
  const button = event.target.closest('[data-attention-filter]');
  if (!button) return;
  state.attentionFilter = button.dataset.attentionFilter === 'all' ? 'all' : button.dataset.attentionFilter;
  $('attentionFilter').value = state.attentionFilter;
  renderAttention(state.snapshot);
});
$('attentionRows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-attention-detail]');
  if (!button) return;
  openDetail('attention', button.dataset.attentionDetail);
});
$('modalClose').addEventListener('click', () => $('detailModal').close());
$('problemFilter').addEventListener('change', (event) => {
  state.problemFilter = event.target.value;
  renderProblems(state.snapshot);
});
$('attentionFilter').addEventListener('change', (event) => {
  state.attentionFilter = event.target.value;
  renderAttention(state.snapshot);
});
$('logSelect').addEventListener('change', (event) => {
  state.logType = event.target.value;
  renderLogs(state.snapshot);
});

loadSnapshot(true);
setInterval(() => loadSnapshot(false), 60000);
