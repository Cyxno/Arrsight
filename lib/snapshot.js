import path from 'node:path';
import { buildAttentionItems, buildIncidents, classifyOverview, classifyQueue, deriveProviders, metricPoint, pruneHistory, reconcileIncidentHistory, trend, verifierSummary } from './telemetry.js';
import { runMountReadTest, updateMountState } from './mount-check.js';
import { readTail, recentLines, parseVerifier, parsePeriodic, parseProblemLines, parseAttentionEvents } from './logs.js';
import { readUsageHistory, readMetricsHistory, readIncidentHistory, networkTotals, startOfPeriod, sumUsage, sumUnattributedUsage, USAGE_MAX_ATTRIBUTION_MS } from './history.js';
import { fetchJson } from './http.js';

const SNAPSHOT_TTL_MS = 20000;

function groupBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = fn(row);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

// A single probe failing must never take the whole dashboard down. fetchJson
// and the Docker client already turn network failures into result objects;
// settle() is the last line of defense for unexpected programming errors and
// logs them loudly instead of swallowing them silently.
function settle(label, promise, fallback) {
  return promise.catch((error) => {
    console.error(`Snapshot probe "${label}" failed unexpectedly:`, error?.message);
    return fallback;
  });
}

export function createSnapshotService({ getConfig, docker, history, paths }) {
  let lastSnapshot = null;
  let lastSnapshotAt = 0;
  let buildPromise = null;

  async function arrHealth(app) {
    const base = getConfig()[app];
    const started = performance.now();
    const result = await fetchJson(`${base.url}/api/v3/health?apikey=${encodeURIComponent(base.apiKey)}`);
    return { app, reachable: result.ok, ok: result.ok && Array.isArray(result.data) && result.data.length === 0, status: result.status, latencyMs: Math.round(performance.now() - started), checkedAt: new Date().toISOString(), data: result.data || result.error };
  }

  async function arrQueue(app) {
    const base = getConfig()[app];
    const result = await fetchJson(`${base.url}/api/v3/queue?apikey=${encodeURIComponent(base.apiKey)}&page=1&pageSize=1000`);
    const records = result.ok ? (result.data.records || []) : [];
    const monitoring = getConfig().monitoring;
    const classified = classifyQueue(records, new Date(), monitoring.queueStaleMinutes, monitoring.queueFailedMinutes, app);
    return { app, ok: result.ok, byStatus: groupBy(records, (r) => r.status || 'unknown'), ...classified, records: classified.rows.slice(0, 50) };
  }

  async function wantedCounts(app) {
    const base = getConfig()[app];
    const [missing, cutoff] = await Promise.all([
      fetchJson(`${base.url}/api/v3/wanted/missing?apikey=${encodeURIComponent(base.apiKey)}&page=1&pageSize=1&monitored=true`),
      fetchJson(`${base.url}/api/v3/wanted/cutoff?apikey=${encodeURIComponent(base.apiKey)}&page=1&pageSize=1&monitored=true`)
    ]);
    return {
      app,
      missing: missing.ok ? missing.data.totalRecords ?? 0 : null,
      cutoff: cutoff.ok ? cutoff.data.totalRecords ?? 0 : null
    };
  }

  async function nzbdavQueue() {
    const config = getConfig();
    const result = await fetchJson(`${config.nzbdav.url}/api?mode=queue&output=json&apikey=${encodeURIComponent(config.nzbdav.apiKey)}`);
    const rows = result.ok ? (result.data.queue?.slots || []) : [];
    const classified = classifyQueue(rows, new Date(), config.monitoring.queueStaleMinutes, config.monitoring.queueFailedMinutes, 'nzbdav');
    return { ok: result.ok, byStatus: groupBy(rows, (r) => r.status || 'unknown'), ...classified, rows: classified.rows.slice(0, 50) };
  }

  async function bazarrProviders() {
    const config = getConfig();
    const result = await fetchJson(`${config.bazarr.url}/api/providers`, {
      headers: { 'X-API-KEY': config.bazarr.apiKey }
    });
    return { ok: result.ok, providers: result.ok ? (result.data.data || []) : [], error: result.error };
  }

  async function mountStatus(previous = {}) {
    const config = getConfig();
    const targets = { nzbdav: path.join(config.paths.nzbdavMount, 'completed-symlinks'), tvRoot: config.paths.tvRoot, movieRoot: config.paths.movieRoot };
    const entries = [];
    for (const [name, target] of Object.entries(targets)) entries.push([name, await runMountReadTest(target, { timeoutMs: config.monitoring.mountTimeoutMs, warnMs: config.monitoring.mountWarnMs })]);
    const checks = Object.fromEntries(entries);
    const persisted = updateMountState(previous, checks);
    for (const [name, check] of Object.entries(checks)) Object.assign(check, persisted[name]);
    const states = Object.values(checks).map((check) => check.status);
    const overall = states.includes('incident') ? 'incident' : states.includes('degraded') ? 'degraded' : states.every((s) => s === 'healthy') ? 'healthy' : 'unknown';
    return {
      ...Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, value.ok])),
      checks, overall, maxLatencyMs: Math.max(0, ...Object.values(checks).map((check) => check.latencyMs || 0)),
      lastKnownGood: Object.values(checks).map((check) => check.lastKnownGood).filter(Boolean).sort().at(0) || null,
      state: persisted
    };
  }

  async function usageReport(force = false) {
    const config = getConfig();
    const { name, info, stats } = await docker.downloadClientStats();
    const now = new Date();
    const totals = stats.ok ? networkTotals(stats.data) : { rxBytes: 0, txBytes: 0, totalBytes: 0 };
    const startedAt = info.ok ? (info.data?.State?.StartedAt || null) : null;
    const historyData = await readUsageHistory(paths.usageHistoryPath);
    const last = historyData.last;
    let rxDelta = 0;
    let txDelta = 0;
    let reset = false;
    let gapMs = 0;
    let attributed = true;
    let attributionReason = 'sampled';

    if (last && last.startedAt === startedAt && totals.rxBytes >= last.rxBytes && totals.txBytes >= last.txBytes) {
      rxDelta = totals.rxBytes - last.rxBytes;
      txDelta = totals.txBytes - last.txBytes;
      gapMs = Math.max(0, now.getTime() - new Date(last.at || now).getTime());
      if (gapMs > USAGE_MAX_ATTRIBUTION_MS) {
        attributed = false;
        attributionReason = 'catch-up gap';
      }
    } else if (last) {
      reset = true;
      attributionReason = 'counter reset';
    }

    const totalDelta = rxDelta + txDelta;
    if (force || totalDelta > 0 || !last || reset) {
      if (totalDelta > 0) {
        historyData.entries.push({
          at: now.toISOString(),
          rxDelta,
          txDelta,
          totalDelta,
          startedAt,
          attributed,
          attributionReason,
          gapSeconds: Math.round(gapMs / 1000)
        });
      }
      historyData.last = { at: now.toISOString(), startedAt, ...totals };
      const keepSince = new Date(now);
      keepSince.setFullYear(keepSince.getFullYear() - 2);
      historyData.entries = historyData.entries.filter((entry) => new Date(entry.at).getTime() >= keepSince.getTime());
      await history.usage.write(historyData);
    }

    const entries = historyData.entries;
    const allTime = sumUsage(entries, new Date(0));
    const unattributed = {
      daily: sumUnattributedUsage(entries, startOfPeriod(now, 'day')),
      weekly: sumUnattributedUsage(entries, startOfPeriod(now, 'week')),
      monthly: sumUnattributedUsage(entries, startOfPeriod(now, 'month')),
      yearly: sumUnattributedUsage(entries, startOfPeriod(now, 'year')),
      allTime: sumUnattributedUsage(entries, new Date(0))
    };
    return {
      ok: stats.ok,
      source: `Docker network IO for container "${name}"; only short sample intervals are counted`,
      generatedAt: now.toISOString(),
      startedAt,
      currentCounters: totals,
      lastSampleAt: historyData.last?.at || null,
      resetDetected: reset,
      maxAttributionMinutes: Math.round(USAGE_MAX_ATTRIBUTION_MS / 60000),
      samples: entries.length,
      periods: {
        daily: sumUsage(entries, startOfPeriod(now, 'day')),
        weekly: sumUsage(entries, startOfPeriod(now, 'week')),
        monthly: sumUsage(entries, startOfPeriod(now, 'month')),
        yearly: sumUsage(entries, startOfPeriod(now, 'year')),
        allTime
      },
      unattributed,
      recent: entries.slice(-96)
    };
  }

  async function recordMetrics(snapshot) {
    const config = getConfig();
    const historyData = await readMetricsHistory(paths.metricsHistoryPath, config.monitoring.retentionDays);
    const lastAt = new Date(historyData.points.at(-1)?.at || 0).getTime();
    const interval = Math.max(1, Number(config.monitoring.sampleMinutes || 5)) * 60000;
    if (Date.now() - lastAt >= interval) {
      historyData.points.push(metricPoint(snapshot));
      historyData.points = pruneHistory(historyData.points, new Date(), config.monitoring.retentionDays);
      await history.metrics.write(historyData);
    }
    const queueTotal = (point) => Object.values(point.queue || {}).reduce((sum, queue) => sum + Number(queue.total || 0), 0);
    const problemScore = (point) => Number(point.problemScore || Object.values(point.queue || {}).reduce((sum, queue) => sum + Number(queue.failed || 0) * 3 + Number(queue.stalled || 0), 0));
    return {
      retentionDays: config.monitoring.retentionDays,
      sampleMinutes: config.monitoring.sampleMinutes,
      points24h: historyData.points.filter((p) => Date.now() - new Date(p.at).getTime() <= 86400000),
      points7d: historyData.points.filter((p) => Date.now() - new Date(p.at).getTime() <= 7 * 86400000),
      activityTrend: trend(historyData.points, queueTotal),
      problemTrend: trend(historyData.points, problemScore)
    };
  }

  // Raw data collection: all independent probes run in parallel, each
  // individually guarded so one broken source degrades only itself.
  async function collect(force) {
    const config = getConfig();
    const operationalHistory = await readIncidentHistory(paths.incidentHistoryPath);
    const disabledQueue = { ok: true, rows: [], total: 0, active: 0, stalled: 0, failed: 0 };
    const [containerResult, sonarrHealth, radarrHealth, sonarrQueue, radarrQueue, sonarrWanted, radarrWanted, nzbdav, bazarr, mounts, logTails, usage] = await Promise.all([
      settle('docker containers', config.monitoring.dockerEnabled ? docker.containers(operationalHistory.containerRestarts) : Promise.resolve({ enabled: false, reachable: undefined, containers: [], restartCounts: {} }), { enabled: false, reachable: false, containers: [], restartCounts: {} }),
      settle('sonarr health', config.sonarr.enabled ? arrHealth('sonarr') : Promise.resolve({ enabled: false, reachable: undefined, ok: true }), { enabled: false, reachable: false, ok: false }),
      settle('radarr health', config.radarr.enabled ? arrHealth('radarr') : Promise.resolve({ enabled: false, reachable: undefined, ok: true }), { enabled: false, reachable: false, ok: false }),
      settle('sonarr queue', config.sonarr.enabled ? arrQueue('sonarr') : Promise.resolve(disabledQueue), disabledQueue),
      settle('radarr queue', config.radarr.enabled ? arrQueue('radarr') : Promise.resolve(disabledQueue), disabledQueue),
      settle('sonarr wanted', config.sonarr.enabled ? wantedCounts('sonarr') : Promise.resolve({ missing: null, cutoff: null }), { missing: null, cutoff: null }),
      settle('radarr wanted', config.radarr.enabled ? wantedCounts('radarr') : Promise.resolve({ missing: null, cutoff: null }), { missing: null, cutoff: null }),
      settle('download-client queue', (config.nzbdav.enabled || config.infinidysk.enabled) ? nzbdavQueue() : Promise.resolve(disabledQueue), disabledQueue),
      settle('bazarr providers', config.bazarr.enabled ? bazarrProviders() : Promise.resolve({ ok: true, enabled: false }), { ok: false, enabled: false, providers: [] }),
      settle('mount checks', config.monitoring.mountsEnabled ? mountStatus(operationalHistory.mounts) : Promise.resolve({ enabled: false, checks: {}, overall: 'disabled', state: {}, maxLatencyMs: null }), { enabled: false, checks: {}, overall: 'unknown', state: {}, maxLatencyMs: null }),
      Promise.all([
        readTail(config.paths.verifierLog),
        readTail(config.paths.periodicLog),
        readTail(config.paths.watchdogLog),
        readTail(config.paths.rcloneLog),
        readTail(config.paths.bazarrLog),
        readTail(config.paths.actionLog),
        settle('download-client logs', docker.downloadClientLogs(86400), '')
      ]),
      settle('usage report', usageReport(force), { ok: false, source: 'unavailable', generatedAt: new Date().toISOString(), periods: {}, unattributed: {}, recent: [], samples: 0 })
    ]);
    const [verifierLog, periodicLog, watchdogLog, rcloneLog, bazarrLog, actionLog, downloadClientLog] = logTails;
    return {
      containerResult, sonarrHealth, radarrHealth, sonarrQueue, radarrQueue, sonarrWanted, radarrWanted, nzbdav, bazarr, mounts, usage,
      verifierLog, periodicLog, watchdogLog, rcloneLog, bazarrLog, actionLog, downloadClientLog,
      operationalHistory
    };
  }

  function parseSources(raw) {
    const verifier = parseVerifier(recentLines(raw.verifierLog, 600));
    const periodic = parsePeriodic(recentLines(raw.periodicLog, 400));
    const nzbdavProblems = parseProblemLines([
      ...recentLines(raw.rcloneLog, 250),
      ...recentLines(raw.downloadClientLog, 650)
    ]);
    const bazarrProblems = parseProblemLines(recentLines(raw.bazarrLog, 500));
    const watchdogLines = recentLines(raw.watchdogLog, 120);
    const attention = parseAttentionEvents([
      { name: 'Download client docker', lines: recentLines(raw.downloadClientLog, 900) },
      { name: 'Periodic search', lines: recentLines(raw.periodicLog, 500) },
      { name: 'Integrity verifier', lines: recentLines(raw.verifierLog, 700) },
      { name: 'Mount watchdog', lines: watchdogLines },
      { name: 'rclone', lines: recentLines(raw.rcloneLog, 260) },
      { name: 'Bazarr', lines: recentLines(raw.bazarrLog, 300) }
    ]);
    verifier.summary = verifierSummary(verifier.runs);
    return { verifier, periodic, nzbdavProblems, bazarrProblems, watchdogLines, attention };
  }

  function assemble(raw, parsed) {
    const allIncidents = buildIncidents(parsed.attention.recent);
    const snapshot = {
      generatedAt: new Date().toISOString(),
      containers: raw.containerResult.containers,
      docker: { reachable: raw.containerResult.reachable },
      health: { sonarr: raw.sonarrHealth, radarr: raw.radarrHealth },
      queues: { sonarr: raw.sonarrQueue, radarr: raw.radarrQueue, nzbdav: raw.nzbdav },
      wanted: { sonarr: raw.sonarrWanted, radarr: raw.radarrWanted },
      bazarr: raw.bazarr,
      links: getConfig().links,
      mounts: raw.mounts,
      repairs: parsed.verifier,
      periodic: parsed.periodic,
      attention: parsed.attention,
      incidents: {
        active: allIncidents.filter((incident) => incident.active),
        resolved: [],
        historical: [],
        rules: 'Active is currently relevant; resolved stays visible for the resolved window; historical contains older resolved occurrences within retention.'
      },
      usage: raw.usage,
      problems: {
        nzbdav: parsed.nzbdavProblems,
        bazarr: parsed.bazarrProblems,
        recent: [...parsed.nzbdavProblems.problems, ...parsed.bazarrProblems.problems].slice(-200)
      },
      logs: {
        verifier: recentLines(raw.verifierLog, 120),
        periodic: recentLines(raw.periodicLog, 120),
        watchdog: parsed.watchdogLines,
        actions: recentLines(raw.actionLog, 160),
        nzbdav: recentLines(raw.downloadClientLog, 160),
        bazarr: recentLines(raw.bazarrLog, 160)
      }
    };
    snapshot.providers = deriveProviders(parsed.attention.recent || [], allIncidents, new Date(), 24);
    snapshot.chain = buildChain(snapshot);
    snapshot.attentionItems = buildAttentionItems(snapshot);
    return { snapshot, allIncidents };
  }

  async function finalize(snapshot, allIncidents, operationalHistory, restartCounts) {
    const config = getConfig();
    const currentByKey = new Map(snapshot.attentionItems.map((item) => [item.key, item]));
    const lifecycle = reconcileIncidentHistory(operationalHistory.incidents, snapshot.attentionItems.map((item) => ({ fingerprint: item.key, id: item.type, title: item.title, severity: item.severity, area: item.tab, source: item.source, firstSeen: item.firstSeen, lastSeen: item.lastSeen, count: 1 })), new Date(), config.monitoring.resolvedHours, config.monitoring.retentionDays);
    const enrich = (item) => ({ ...item, advice: currentByKey.get(item.fingerprint)?.advice || 'The problem is no longer active.', detail: currentByKey.get(item.fingerprint)?.detail || 'incidents' });
    snapshot.incidents = { ...snapshot.incidents, active: lifecycle.active.map(enrich), resolved: lifecycle.resolved.map(enrich), historical: lifecycle.historical.map(enrich) };
    snapshot.overview = classifyOverview(snapshot);
    snapshot.history = await recordMetrics(snapshot);
    await history.incidents.write({ version: 1, incidents: lifecycle.entries, mounts: snapshot.mounts.state, containerRestarts: restartCounts });
    return snapshot;
  }

  async function buildOnce(force = false) {
    const now = Date.now();
    if (!force && lastSnapshot && now - lastSnapshotAt < SNAPSHOT_TTL_MS) return lastSnapshot;
    const raw = await collect(force);
    const parsed = parseSources(raw);
    const { snapshot, allIncidents } = assemble(raw, parsed);
    const finished = await finalize(snapshot, allIncidents, raw.operationalHistory, raw.containerResult.restartCounts);
    lastSnapshot = finished;
    lastSnapshotAt = now;
    return finished;
  }

  function build(force = false) {
    if (buildPromise) return buildPromise;
    buildPromise = buildOnce(force).finally(() => { buildPromise = null; });
    return buildPromise;
  }

  return {
    build,
    // A config save discards the cached snapshot entirely.
    reset() { lastSnapshot = null; lastSnapshotAt = 0; },
    // Management actions only mark the cache stale so the next request rebuilds.
    invalidate() { lastSnapshotAt = 0; }
  };
}

export function buildChain(snapshot) {
  const node = (id, label, status, latencyMs, lastSuccess, problem = null) => ({ id, label, status, latencyMs, lastSuccess, problem });
  const plex = snapshot.containers.find((container) => /plex/i.test(container.name));
  const bazarrContainer = snapshot.containers.find((container) => /bazarr/i.test(container.name));
  return [
    node('arr', 'Sonarr / Radarr', snapshot.health.sonarr.reachable && snapshot.health.radarr.reachable ? (snapshot.health.sonarr.ok && snapshot.health.radarr.ok ? 'healthy' : 'degraded') : 'incident', Math.max(snapshot.health.sonarr.latencyMs || 0, snapshot.health.radarr.latencyMs || 0), snapshot.health.sonarr.reachable && snapshot.health.radarr.reachable ? snapshot.generatedAt : null),
    node('provider', 'Usenet providers', snapshot.providers.some((p) => p.status === 'degraded') ? 'degraded' : snapshot.providers.length ? 'healthy' : 'unknown', null, null, snapshot.providers.find((p) => p.status === 'degraded')?.name || null),
    node('infinidysk', 'Download client', snapshot.queues.nzbdav.ok ? (snapshot.queues.nzbdav.failed ? 'incident' : 'healthy') : 'incident', null, snapshot.queues.nzbdav.ok ? snapshot.generatedAt : null),
    node('mount', 'WebDAV mount', snapshot.mounts.overall, snapshot.mounts.maxLatencyMs, snapshot.mounts.lastKnownGood, snapshot.mounts.enabled === false ? 'Not configured' : null),
    node('library', 'Import / library', !snapshot.queues.sonarr.ok || !snapshot.queues.radarr.ok ? 'unknown' : snapshot.queues.sonarr.failed + snapshot.queues.radarr.failed ? 'incident' : snapshot.queues.sonarr.stalled + snapshot.queues.radarr.stalled ? 'degraded' : 'healthy', null, snapshot.queues.sonarr.ok && snapshot.queues.radarr.ok ? snapshot.generatedAt : null),
    node('bazarr', 'Bazarr', snapshot.bazarr.ok ? 'healthy' : bazarrContainer && !bazarrContainer.ok ? 'incident' : 'unknown', null, snapshot.bazarr.ok ? snapshot.generatedAt : null, snapshot.bazarr.ok ? null : 'API not confirmed'),
    node('plex', 'Plex container', !plex ? 'disabled' : plex.ok && plex.health !== 'unhealthy' ? 'healthy' : 'incident', null, plex?.ok ? snapshot.generatedAt : null, !plex ? 'Not configured' : plex.ok ? null : 'Container not active')
  ];
}
