import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIncidents, classifyOverview, classifyQueue, metricPoint, pruneHistory, trend } from './lib/telemetry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const configPath = path.join(__dirname, 'config.json');
const usageHistoryPath = path.join(__dirname, 'usage-history.json');
const metricsHistoryPath = path.join(__dirname, 'metrics-history.json');
const usageMaxAttributionMs = 15 * 60 * 1000;

const defaultConfig = {
  port: 8090,
  sonarr: { url: 'http://127.0.0.1:7854', apiKey: '' },
  radarr: { url: 'http://127.0.0.1:7878', apiKey: '' },
  nzbdav: { url: 'http://127.0.0.1:3001', apiKey: '' },
  bazarr: { url: 'http://127.0.0.1:6767', apiKey: '' },
  links: {
    sonarr: 'http://192.168.1.2:7854',
    radarr: 'http://192.168.1.2:7878',
    bazarr: 'http://192.168.1.2:6767',
    nzbdav: 'http://192.168.1.2:3001',
    plex: 'http://192.168.1.2:32400/web',
    seerr: 'http://192.168.1.2:5055'
  },
  paths: {
    verifierLog: '/data/codex-arr-file-verifier/arr-file-integrity-verifier.log',
    periodicLog: '/data/codex-arr-periodic-search/arr-periodic-search.log',
    watchdogLog: '/data/NzbDAV/nzbdav-mount-watchdog.log',
    rcloneLog: '/data/NzbDAV/rclone-mount.log',
    bazarrLog: '/data/bazarr/log/bazarr.log',
    actionDir: '/app/actions',
    actionLog: '/data/arr-health-dashboard/action-runner.log',
    tvRoot: '/symlinks/TV Shows',
    movieRoot: '/symlinks/Movies',
    nzbdavMount: '/nzbdav'
  },
  dockerSocket: '/var/run/docker.sock',
  containers: ['InfiniDysk', 'binhex-sonarr', 'binhex-radarr', 'bazarr', 'binhex-plexpass'],
  monitoring: { sampleMinutes: 5, retentionDays: 90, queueStaleMinutes: 30, queueFailedMinutes: 120, mountWarnMs: 1500, mountTimeoutMs: 5000 }
};

let config = defaultConfig;
let lastSnapshot = null;
let lastSnapshotAt = 0;
let usageWriteQueue = Promise.resolve();
let metricsWriteQueue = Promise.resolve();
let measurementRunning = false;
let actionRunning = false;

async function loadConfig() {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    config = deepMerge(defaultConfig, JSON.parse(raw));
  } catch {
    config = defaultConfig;
  }
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(base[key] || {}, value)
      : value;
  }
  return out;
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(json);
}

function sendText(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function dockerRequest(endpoint, method = 'GET') {
  return new Promise((resolve) => {
    const req = http.request({
      socketPath: config.dockerSocket,
      path: endpoint,
      method
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8').replace(/\u0000/g, '');
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text });
      });
    });
    req.on('error', (error) => resolve({ ok: false, status: 0, text: error.message }));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ ok: false, status: 0, text: 'docker socket timeout' });
    });
    req.end();
  });
}

async function dockerJson(endpoint) {
  const result = await dockerRequest(endpoint);
  if (!result.ok) return { ok: false, status: result.status, error: result.text };
  try {
    return { ok: true, status: result.status, data: JSON.parse(result.text) };
  } catch {
    return { ok: false, status: result.status, error: 'Invalid Docker JSON' };
  }
}

async function dockerPost(endpoint) {
  const result = await dockerRequest(endpoint, 'POST');
  return { ok: result.ok, status: result.status, text: result.text };
}

async function readUsageHistory() {
  try {
    const raw = await fs.readFile(usageHistoryPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      last: parsed.last || null,
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch {
    return { version: 1, last: null, entries: [] };
  }
}

async function writeUsageHistory(history) {
  usageWriteQueue = usageWriteQueue.then(async () => {
    await fs.writeFile(usageHistoryPath, JSON.stringify(history, null, 2) + '\n', { mode: 0o600 });
  }).catch(() => {});
  return usageWriteQueue;
}

async function readMetricsHistory() {
  try {
    const parsed = JSON.parse(await fs.readFile(metricsHistoryPath, 'utf8'));
    return { version: 1, points: pruneHistory(parsed.points, new Date(), config.monitoring.retentionDays) };
  } catch {
    return { version: 1, points: [] };
  }
}

async function writeMetricsHistory(history) {
  metricsWriteQueue = metricsWriteQueue.then(async () => {
    const temporary = `${metricsHistoryPath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(history)}\n`, { mode: 0o600 });
    await fs.rename(temporary, metricsHistoryPath);
  }).catch((error) => console.error('Metrics history write failed:', error.message));
  return metricsWriteQueue;
}

async function recordMetrics(snapshot) {
  const history = await readMetricsHistory();
  const lastAt = new Date(history.points.at(-1)?.at || 0).getTime();
  const interval = Math.max(1, Number(config.monitoring.sampleMinutes || 5)) * 60000;
  if (Date.now() - lastAt >= interval) {
    history.points.push(metricPoint(snapshot));
    history.points = pruneHistory(history.points, new Date(), config.monitoring.retentionDays);
    await writeMetricsHistory(history);
  }
  const queueTotal = (point) => Object.values(point.queue || {}).reduce((sum, queue) => sum + Number(queue.total || 0), 0);
  return {
    retentionDays: config.monitoring.retentionDays,
    sampleMinutes: config.monitoring.sampleMinutes,
    points24h: history.points.filter((p) => Date.now() - new Date(p.at).getTime() <= 86400000),
    points7d: history.points.filter((p) => Date.now() - new Date(p.at).getTime() <= 7 * 86400000),
    queueTrend: trend(history.points, queueTotal)
  };
}

function networkTotals(stats) {
  const networks = stats?.networks || {};
  let rxBytes = 0;
  let txBytes = 0;
  for (const network of Object.values(networks)) {
    rxBytes += Number(network.rx_bytes || 0);
    txBytes += Number(network.tx_bytes || 0);
  }
  return { rxBytes, txBytes, totalBytes: rxBytes + txBytes };
}

function startOfPeriod(date, period) {
  const d = new Date(date);
  if (period === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === 'week') {
    const day = (d.getDay() + 6) % 7;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    start.setDate(start.getDate() - day);
    return start;
  }
  if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  if (period === 'year') return new Date(d.getFullYear(), 0, 1);
  return new Date(0);
}

function sumUsage(entries, since) {
  return entries
    .filter((entry) => new Date(entry.at).getTime() >= since.getTime() && entry.attributed !== false)
    .reduce((acc, entry) => ({
      rxBytes: acc.rxBytes + Number(entry.rxDelta || 0),
      txBytes: acc.txBytes + Number(entry.txDelta || 0),
      totalBytes: acc.totalBytes + Number(entry.totalDelta || 0)
    }), { rxBytes: 0, txBytes: 0, totalBytes: 0 });
}

function sumUnattributedUsage(entries, since) {
  return entries
    .filter((entry) => new Date(entry.at).getTime() >= since.getTime() && entry.attributed === false)
    .reduce((acc, entry) => ({
      rxBytes: acc.rxBytes + Number(entry.rxDelta || 0),
      txBytes: acc.txBytes + Number(entry.txDelta || 0),
      totalBytes: acc.totalBytes + Number(entry.totalDelta || 0)
    }), { rxBytes: 0, txBytes: 0, totalBytes: 0 });
}

async function nzbdavUsage(force = false) {
  const stats = await dockerJson('/containers/InfiniDysk/stats?stream=false');
  const info = await dockerJson('/containers/InfiniDysk/json');
  const now = new Date();
  const totals = stats.ok ? networkTotals(stats.data) : { rxBytes: 0, txBytes: 0, totalBytes: 0 };
  const startedAt = info.ok ? (info.data?.State?.StartedAt || null) : null;
  const history = await readUsageHistory();
  const last = history.last;
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
    if (gapMs > usageMaxAttributionMs) {
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
      history.entries.push({
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
    history.last = { at: now.toISOString(), startedAt, ...totals };
    const keepSince = new Date(now);
    keepSince.setFullYear(keepSince.getFullYear() - 2);
    history.entries = history.entries.filter((entry) => new Date(entry.at).getTime() >= keepSince.getTime());
    await writeUsageHistory(history);
  }

  const entries = history.entries;
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
    source: 'Docker InfiniDysk network IO, alleen korte sample-intervallen meegeteld',
    generatedAt: now.toISOString(),
    startedAt,
    currentCounters: totals,
    lastSampleAt: history.last?.at || null,
    resetDetected: reset,
    maxAttributionMinutes: Math.round(usageMaxAttributionMs / 60000),
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

async function readTail(file, maxBytes = 180000) {
  try {
    const stat = await fs.stat(file);
    const start = Math.max(0, stat.size - maxBytes);
    const handle = await fs.open(file, 'r');
    const buffer = Buffer.alloc(stat.size - start);
    await handle.read(buffer, 0, buffer.length, start);
    await handle.close();
    return buffer.toString('utf8');
  } catch {
    return '';
  }
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 65536) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error(`Invalid JSON: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

function recentLines(text, count = 200) {
  return text.split(/\r?\n/).filter(Boolean).slice(-count);
}

function countMatches(lines, patterns) {
  const counts = {};
  for (const [name, pattern] of Object.entries(patterns)) counts[name] = 0;
  for (const line of lines) {
    for (const [name, pattern] of Object.entries(patterns)) {
      if (pattern.test(line)) counts[name] += 1;
    }
  }
  return counts;
}

function parseVerifier(lines) {
  const runs = [];
  const repairs = [];
  let current = null;
  for (const line of lines) {
    const start = line.match(/^== ([^ ]+) Arr file integrity verifier start ==/);
    if (start) current = { started: start[1], repairs: 0, streamChecks: 0, bad: [], deferred: 0, confirmedMissing: 0, unmapped: 0 };
    const bad = line.match(/^(sonarr|radarr)_bad .*reason=([^ ]+) path=(.*)$/);
    if (bad) {
      repairs.push({ app: bad[1], reason: bad[2], path: bad[3] });
      if (current) current.bad.push({ app: bad[1], reason: bad[2], path: bad[3] });
    }
    if (/^(sonarr|radarr)_missing_deferred /.test(line) && current) current.deferred += 1;
    if (/^(sonarr|radarr)_missing_confirmed /.test(line) && current) current.confirmedMissing += 1;
    if (/^nzbdav_log_unmapped /.test(line) && current) current.unmapped += 1;
    const done = line.match(/^== ([^ ]+) Arr file integrity verifier done repairs=(\d+) stream_checks=(\d+) ==/);
    if (done) {
      const run = current || {};
      run.ended = done[1];
      run.repairs = Number(done[2]);
      run.streamChecks = Number(done[3]);
      runs.push(run);
      current = null;
    }
  }
  return { runs: runs.slice(-24), repairs: repairs.slice(-100) };
}

function parsePeriodic(lines) {
  const events = [];
  const runs = [];
  const counts = {
    sonarr_missing: 0,
    sonarr_upgrade: 0,
    radarr_missing: 0,
    radarr_upgrade: 0,
    radarr_missing_backoff: 0,
    radarr_blocklist_retry_delete: 0,
    skipped: 0
  };
  let current = null;
  for (const line of lines) {
    const start = line.match(/^== ([^ ]+) Arr periodic search start ==/);
    if (start) current = {
      started: start[1],
      sonarr_missing: 0,
      sonarr_upgrade: 0,
      radarr_missing: 0,
      radarr_upgrade: 0,
      radarr_missing_backoff: 0,
      radarr_blocklist_retry_delete: 0,
      skipped: 0
    };
    const match = line.match(/^(sonarr_missing|sonarr_upgrade|radarr_missing|radarr_upgrade) .* http=(\d+)/);
    if (match) {
      counts[match[1]] += 1;
      events.push({ type: match[1], http: Number(match[2]), line });
      if (current) current[match[1]] += 1;
    }
    const backoff = line.match(/^(radarr_missing_backoff) movie=(\d+) .*recent_blocklist=(\d+)/);
    if (backoff) {
      counts.radarr_missing_backoff += 1;
      events.push({ type: backoff[1], movieId: Number(backoff[2]), recentBlocklist: Number(backoff[3]), line });
      if (current) current.radarr_missing_backoff += 1;
    }
    const retry = line.match(/^(radarr_blocklist_retry_delete) id=(\d+) http=(\d+)/);
    if (retry) {
      counts.radarr_blocklist_retry_delete += 1;
      events.push({ type: retry[1], id: Number(retry[2]), http: Number(retry[3]), line });
      if (current) current.radarr_blocklist_retry_delete += 1;
    }
    if (/skipping this run/i.test(line)) {
      counts.skipped += 1;
      if (current) current.skipped += 1;
    }
    const done = line.match(/^== ([^ ]+) Arr periodic search (done|skipped) ==/);
    if (done) {
      const run = current || {};
      run.ended = done[1];
      run.status = done[2];
      runs.push(run);
      current = null;
    }
  }
  return { counts, events: events.slice(-160), runs: runs.slice(-18) };
}

function parseProblemLines(lines) {
  const problems = [];
  const unique = new Map();
  const patterns = {
    missingArticles: /missing articles|Article with message-id .* not found/i,
    corruptStream: /Corrupt file|Shared stream pump failed|EBML header parsing failed|Invalid data found when processing input/i,
    notFound: /\b404\b|not found/i,
    timeout: /Timeout|timed out/i,
    stuck: /Resolved stuck|stuck queue/i,
    pathMissing: /Path does not exist/i,
    providerLimit: /DownloadLimitExceeded|TooManyRequests|Rate limit/i
  };
  for (const line of lines) {
    let type = null;
    for (const [name, pattern] of Object.entries(patterns)) {
      if (pattern.test(line)) {
        type = name;
        break;
      }
    }
    if (!type) continue;
    const title = extractTitle(line);
    const key = `${type}:${title}`;
    const existing = unique.get(key);
    unique.set(key, {
      type,
      title,
      count: (existing?.count || 0) + 1,
      line
    });
    problems.push({ type, title, line });
  }
  const counts = countMatches(lines, patterns);
  const rawTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const uniqueProblems = [...unique.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 80);
  return {
    counts,
    rawTotal,
    uniqueTotal: unique.size,
    uniqueProblems,
    problems: problems.slice(-180)
  };
}

function parseAttentionEvents(sources) {
  const rules = [
    {
      id: 'provider-trip',
      title: 'Provider trip / timeout',
      severity: 'critical',
      area: 'Usenet providers',
      advice: 'Let op Viper/Sunny timeouts of trips. Als dit oploopt: Viper lager zetten of tijdelijk uit.',
      test: /Provider .*tripped|connection limit|read-timeout|TimeoutException|TooManyRequests|DownloadLimitExceeded/i
    },
    {
      id: 'single-provider',
      title: 'Maar 1 provider gebruikt',
      severity: 'warning',
      area: 'Usenet providers',
      advice: 'Fallback wordt niet gebruikt of is niet eligible. Check providerconfig als missing articles blijven oplopen.',
      test: /EligibleProviders:\s*1\b/i
    },
    {
      id: 'missing-articles',
      title: 'Missing articles / DMCA',
      severity: 'warning',
      area: 'NZB health',
      advice: 'Normaal bij takedowns. Belangrijk wordt het als dezelfde titel vaak terugkomt of geen 1080p fallback pakt.',
      test: /Missing articles|No Such Article|First segment .* missing|Article with message-id .* not found/i
    },
    {
      id: 'repair-action',
      title: 'Repair / blocklist actie',
      severity: 'info',
      area: 'Repair flow',
      advice: 'Dit is meestal goed: kapotte release wordt verwijderd/geblocklist en opnieuw gezocht.',
      test: /bad_import_queue_delete|failed_queue_delete|RemoveAndBlocklist|RemoveAndBlocklistAndSearch|sonarr_bad|radarr_bad|_delete file_id=/i
    },
    {
      id: 'import-stuck',
      title: 'Import blijft hangen',
      severity: 'critical',
      area: 'Sonarr/Radarr import',
      advice: 'Completed/importPending of sample-detectie blijft hangen. Periodic cleanup hoort dit te verwijderen en opnieuw te zoeken.',
      test: /importPending|Unable to determine if file is a sample|No files found are eligible for import|Failed to import|path does not exist|not accessible by (Sonarr|Radarr)/i
    },
    {
      id: 'fallback-rescue',
      title: 'Recent missing rescue',
      severity: 'info',
      area: 'Nieuwe afleveringen',
      advice: 'De fallback-rescue grijpt in voor recente missing episodes en kiest een lagere/andere release.',
      test: /sonarr_recent_rescue_(grab|skip|error)/i
    },
    {
      id: 'search-limit',
      title: 'Replacement limit bereikt',
      severity: 'warning',
      area: 'Search loop',
      advice: 'Er zijn te veel kapotte releases geprobeerd. Check of er nog acceptabele 720p/1080p releases beschikbaar zijn.',
      test: /Automatic replacement-search limit reached|no_untried_viable_release/i
    },
    {
      id: 'mount-watchdog',
      title: 'Mount/watchdog herstel',
      severity: 'warning',
      area: 'Mount',
      advice: 'Mount was stale/missing of containers zagen hem niet. Als dit vaak terugkomt: rclone/watchdog verder aanscherpen.',
      test: /stale|missing or stale|does not see .*restarting|not mounted|recovered|Backend proxy failed|ECONNRESET/i
    },
    {
      id: 'corrupt-media',
      title: 'Corrupt/onleesbare media',
      severity: 'critical',
      area: 'Playback',
      advice: 'Bestand is niet betrouwbaar afspeelbaar. Hoort door repair/verifier verwijderd en opnieuw gezocht te worden.',
      test: /unreadable media|corrupt RAR|Corrupt file|EBML header|Invalid data found|gap-fill|decoded .* short/i
    },
    {
      id: 'queue-busy',
      title: 'Queue/backlog busy',
      severity: 'info',
      area: 'Load',
      advice: 'Scripts pauzeren zwaardere checks als InfiniDysk druk is. Goed gedrag, maar langdurig busy is verdacht.',
      test: /Backlog is busy|queue is busy|Skipping .* while InfiniDysk is busy|nzbdav_queue_count=\d+/i
    }
  ];

  const events = [];
  for (const source of sources) {
    const lines = source.lines || [];
    for (const line of lines) {
      for (const rule of rules) {
        if (!rule.test.test(line)) continue;
        events.push({
          id: rule.id,
          title: rule.title,
          severity: rule.severity,
          area: rule.area,
          advice: rule.advice,
          source: source.name,
          subject: attentionSubject(rule.id, line, source.name),
          line
        });
        break;
      }
    }
  }

  const byRule = [];
  const grouped = new Map();
  for (const event of events) {
    const key = `${event.id}:${event.source}:${event.subject}`;
    const item = grouped.get(key) || { ...event, count: 0 };
    item.count += 1;
    item.line = event.line;
    grouped.set(key, item);
  }
  byRule.push(...grouped.values());
  byRule.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity) || b.count - a.count);

  const counts = {
    critical: byRule.filter((e) => e.severity === 'critical').length,
    warning: byRule.filter((e) => e.severity === 'warning').length,
    info: byRule.filter((e) => e.severity === 'info').length
  };

  return {
    counts,
    total: byRule.length,
    rawTotal: events.length,
    generatedAt: new Date().toISOString(),
    watchlist: byRule.slice(0, 80),
    recent: events.slice(-240)
  };
}

function attentionSubject(id, line, sourceName) {
  if (id === 'single-provider') return `${sourceName}: fallback provider niet gebruikt`;
  if (/Usenet segment was unavailable/i.test(line)) return 'Usenet segment unavailable';
  if (/Article with message-id .* not found/i.test(line) && !/\/content\//i.test(line)) return 'Article not found';
  return extractTitle(line);
}

function severityWeight(severity) {
  if (severity === 'critical') return 3;
  if (severity === 'warning') return 2;
  return 1;
}

function extractTitle(line) {
  const failedQueue = line.match(/Failed queue item\s+(.+?)\s+\([0-9a-f-]{24,}\)/i);
  if (failedQueue) return basenameTitle(failedQueue[1]);
  const resolvedQueue = line.match(/Resolved \d+ stuck queue item\(s\) for\s+(.+?)\s+from http/i);
  if (resolvedQueue) return basenameTitle(resolvedQueue[1]);
  const contentPath = line.match(/\/content\/(?:tv|movies)\/([^/]+)\//i);
  if (contentPath) return basenameTitle(contentPath[1]);
  const filePath = line.match(/File `([^`]+)`/);
  if (filePath) return basenameTitle(filePath[1]);
  const plainFilePath = line.match(/File (\/content\/(?:tv|movies)\/.*?) (?:has missing articles|could not be read|could not seek to byte position|Reason:)/i);
  if (plainFilePath) return basenameTitle(plainFilePath[1]);
  const rcloneObject = line.match(/\s:\s+([^:]+): .*?(404 Not Found|missing articles|timed out|Timeout)/i);
  if (rcloneObject) return basenameTitle(rcloneObject[1]);
  const pathError = line.match(/file: ([^\n]+)$/i);
  if (pathError) return basenameTitle(pathError[1]);
  const nzb = line.match(/`([^`]+)`/);
  if (nzb) return basenameTitle(nzb[1]);
  return line.replace(/^\S+\s+/, '').slice(0, 120);
}

function basenameTitle(value) {
  const clean = value.split('/').filter(Boolean).pop() || value;
  return clean.replace(/\.(mkv|mp4|avi|srt|iso)$/i, '').slice(0, 140);
}

async function arrHealth(app) {
  const base = config[app];
  const started = performance.now();
  const result = await fetchJson(`${base.url}/api/v3/health?apikey=${encodeURIComponent(base.apiKey)}`);
  return { app, reachable: result.ok, ok: result.ok && Array.isArray(result.data) && result.data.length === 0, status: result.status, latencyMs: Math.round(performance.now() - started), checkedAt: new Date().toISOString(), data: result.data || result.error };
}

function providerPerformance(attention) {
  const lines = attention.recent || [];
  const names = ['Sunny', 'Viper'];
  return names.map((name) => {
    const related = lines.filter((event) => new RegExp(name, 'i').test(`${event.line} ${event.subject}`));
    const trips = related.filter((event) => event.id === 'provider-trip');
    const missing = related.filter((event) => event.id === 'missing-articles');
    const lastTrip = trips.at(-1)?.observedAt || null;
    return { name, status: trips.length ? 'degraded' : related.length ? 'healthy' : 'unknown', trips: trips.length, missingArticles: missing.length, lastTrip, source: 'afgeleid uit recente logregels', period: 'huidige logsnapshot' };
  }).filter((provider) => provider.status !== 'unknown' || lines.some((event) => new RegExp(provider.name, 'i').test(event.line)));
}

function buildChain(snapshot) {
  const node = (id, label, status, latencyMs, lastSuccess, problem = null) => ({ id, label, status, latencyMs, lastSuccess, problem });
  return [
    node('arr', 'Sonarr / Radarr', snapshot.health.sonarr.reachable && snapshot.health.radarr.reachable ? (snapshot.health.sonarr.ok && snapshot.health.radarr.ok ? 'healthy' : 'degraded') : 'incident', Math.max(snapshot.health.sonarr.latencyMs || 0, snapshot.health.radarr.latencyMs || 0), snapshot.health.sonarr.reachable && snapshot.health.radarr.reachable ? snapshot.generatedAt : null),
    node('provider', 'Usenet-provider', snapshot.providers.some((p) => p.status === 'degraded') ? 'degraded' : snapshot.providers.length ? 'healthy' : 'unknown', null, null, snapshot.providers.find((p) => p.status === 'degraded')?.name || null),
    node('infinidysk', 'InfiniDysk', snapshot.queues.nzbdav.ok ? (snapshot.queues.nzbdav.failed ? 'incident' : 'healthy') : 'incident', null, snapshot.queues.nzbdav.ok ? snapshot.generatedAt : null),
    node('mount', 'WebDAV-mount', snapshot.mounts.overall, snapshot.mounts.maxLatencyMs, snapshot.mounts.lastKnownGood),
    node('library', 'Import / library', !snapshot.queues.sonarr.ok || !snapshot.queues.radarr.ok ? 'unknown' : snapshot.queues.sonarr.failed + snapshot.queues.radarr.failed ? 'incident' : snapshot.queues.sonarr.stalled + snapshot.queues.radarr.stalled ? 'degraded' : 'healthy', null, snapshot.queues.sonarr.ok && snapshot.queues.radarr.ok ? snapshot.generatedAt : null),
    node('bazarr', 'Bazarr', snapshot.bazarr.ok ? 'healthy' : 'unknown', null, snapshot.bazarr.ok ? snapshot.generatedAt : null)
  ];
}

async function arrQueue(app) {
  const base = config[app];
  const result = await fetchJson(`${base.url}/api/v3/queue?apikey=${encodeURIComponent(base.apiKey)}&page=1&pageSize=1000`);
  const records = result.ok ? (result.data.records || []) : [];
  const classified = classifyQueue(records, new Date(), config.monitoring.queueStaleMinutes, config.monitoring.queueFailedMinutes);
  return { app, ok: result.ok, byStatus: groupBy(records, (r) => r.status || 'unknown'), ...classified, records: classified.rows.slice(0, 50) };
}

async function wantedCounts(app) {
  const base = config[app];
  const missingPath = app === 'sonarr' ? 'wanted/missing' : 'wanted/missing';
  const cutoffPath = app === 'sonarr' ? 'wanted/cutoff' : 'wanted/cutoff';
  const [missing, cutoff] = await Promise.all([
    fetchJson(`${base.url}/api/v3/${missingPath}?apikey=${encodeURIComponent(base.apiKey)}&page=1&pageSize=1&monitored=true`),
    fetchJson(`${base.url}/api/v3/${cutoffPath}?apikey=${encodeURIComponent(base.apiKey)}&page=1&pageSize=1&monitored=true`)
  ]);
  return {
    app,
    missing: missing.ok ? missing.data.totalRecords ?? 0 : null,
    cutoff: cutoff.ok ? cutoff.data.totalRecords ?? 0 : null
  };
}

async function nzbdavQueue() {
  const result = await fetchJson(`${config.nzbdav.url}/api?mode=queue&output=json&apikey=${encodeURIComponent(config.nzbdav.apiKey)}`);
  const rows = result.ok ? (result.data.queue?.slots || []) : [];
  const classified = classifyQueue(rows, new Date(), config.monitoring.queueStaleMinutes, config.monitoring.queueFailedMinutes);
  return { ok: result.ok, byStatus: groupBy(rows, (r) => r.status || 'unknown'), ...classified, rows: classified.rows.slice(0, 50) };
}

async function bazarrProviders() {
  const result = await fetchJson(`${config.bazarr.url}/api/providers`, {
    headers: { 'X-API-KEY': config.bazarr.apiKey }
  });
  return { ok: result.ok, providers: result.ok ? (result.data.data || []) : [], error: result.error };
}

async function dockerContainers() {
  const containers = [];
  for (const name of config.containers) {
    const info = await dockerJson(`/containers/${encodeURIComponent(name)}/json`);
    containers.push({
      name,
      ok: info.ok && info.data?.State?.Running,
      status: info.data?.State?.Status || info.error || 'unknown',
      health: info.data?.State?.Health?.Status || null,
      startedAt: info.data?.State?.StartedAt || null,
      restartCount: Number(info.data?.RestartCount || 0)
    });
  }
  return containers;
}

async function dockerLogs(name, sinceSeconds = 86400) {
  const since = Math.floor(Date.now() / 1000) - sinceSeconds;
  const result = await dockerRequest(`/containers/${encodeURIComponent(name)}/logs?stdout=1&stderr=1&timestamps=1&since=${since}`);
  return result.ok ? result.text : '';
}

async function arrCommand(app, name) {
  const base = config[app];
  const result = await fetchJson(`${base.url}/api/v3/command?apikey=${encodeURIComponent(base.apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
    timeoutMs: 15000
  });
  return { ok: result.ok, status: result.status, data: result.data };
}

async function queueHostAction(action) {
  const allowed = new Set(['run-verifier', 'run-periodic', 'run-watchdog']);
  if (!allowed.has(action)) return { ok: false, status: 400, error: 'Unknown host action' };
  await fs.mkdir(config.paths.actionDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const requestPath = path.join(config.paths.actionDir, `${stamp}-${action}.request`);
  await fs.writeFile(requestPath, JSON.stringify({ action, requestedAt: new Date().toISOString() }) + '\n', { mode: 0o600 });
  return { ok: true, queued: true, action, request: path.basename(requestPath) };
}

async function runAction(body) {
  if (actionRunning) return { ok: false, status: 409, error: 'Er loopt al een beheeractie' };
  const action = body?.action;
  if (typeof action !== 'string' || action.length > 80) return { ok: false, status: 400, error: 'Ongeldige actie' };
  actionRunning = true;
  try {
  if (action === 'restart-container') {
    const target = String(body?.target || '');
    if (!config.containers.includes(target)) return { ok: false, status: 400, error: 'Container not allowed' };
    const result = await dockerPost(`/containers/${encodeURIComponent(target)}/restart?t=10`);
    lastSnapshotAt = 0;
    return { ok: result.ok, status: result.status, action, target, message: result.ok ? `${target} restarted` : result.text };
  }

  const arrCommands = {
    'sonarr-missing-search': ['sonarr', 'MissingEpisodeSearch'],
    'sonarr-cutoff-search': ['sonarr', 'CutoffUnmetEpisodeSearch'],
    'sonarr-rss-sync': ['sonarr', 'RssSync'],
    'sonarr-refresh-downloads': ['sonarr', 'RefreshMonitoredDownloads'],
    'radarr-missing-search': ['radarr', 'MissingMoviesSearch'],
    'radarr-cutoff-search': ['radarr', 'CutoffUnmetMoviesSearch'],
    'radarr-rss-sync': ['radarr', 'RssSync'],
    'radarr-refresh-downloads': ['radarr', 'RefreshMonitoredDownloads']
  };
  if (arrCommands[action]) {
    const [app, command] = arrCommands[action];
    const result = await arrCommand(app, command);
    lastSnapshotAt = 0;
    return { ok: result.ok, status: result.status, action, app, command, message: result.ok ? `${command} gestart` : JSON.stringify(result.data) };
  }

  if (['run-verifier', 'run-periodic', 'run-watchdog'].includes(action)) {
    const result = await queueHostAction(action);
    lastSnapshotAt = 0;
    return { ...result, status: result.ok ? 202 : result.status };
  }

  return { ok: false, status: 400, error: 'Unknown action' };
  } finally {
    actionRunning = false;
  }
}

function groupBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = fn(row);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

async function mountStatus() {
  const targets = { nzbdav: path.join(config.paths.nzbdavMount, 'completed-symlinks'), tvRoot: config.paths.tvRoot, movieRoot: config.paths.movieRoot };
  const entries = await Promise.all(Object.entries(targets).map(async ([name, target]) => [name, await readTest(target)]));
  const checks = Object.fromEntries(entries);
  const states = Object.values(checks).map((check) => check.status);
  const overall = states.includes('incident') ? 'incident' : states.includes('degraded') ? 'degraded' : states.every((s) => s === 'healthy') ? 'healthy' : 'unknown';
  return {
    ...Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, value.ok])),
    checks, overall, maxLatencyMs: Math.max(0, ...Object.values(checks).map((check) => check.latencyMs || 0)),
    lastKnownGood: Object.values(checks).every((check) => check.ok) ? new Date().toISOString() : null
  };
}

async function readTest(target) {
  const started = performance.now();
  try {
    const timeoutMs = Number(config.monitoring.mountTimeoutMs || 5000);
    await Promise.race([
      fs.readdir(target, { withFileTypes: true }).then((items) => items.slice(0, 1).map((item) => item.name)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('read timeout')), timeoutMs))
    ]);
    const latencyMs = Math.round(performance.now() - started);
    return { ok: true, status: latencyMs >= Number(config.monitoring.mountWarnMs || 1500) ? 'degraded' : 'healthy', latencyMs, checkedAt: new Date().toISOString(), error: null };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    return { ok: false, status: 'incident', latencyMs, checkedAt: new Date().toISOString(), error: error.message };
  }
}

async function buildSnapshot(force = false) {
  const now = Date.now();
  if (!force && lastSnapshot && now - lastSnapshotAt < 20000) return lastSnapshot;

  const [
    containers,
    sonarrHealth,
    radarrHealth,
    sonarrQueue,
    radarrQueue,
    sonarrWanted,
    radarrWanted,
    nzbdav,
    bazarr,
    mounts,
    verifierLog,
    periodicLog,
    watchdogLog,
    rcloneLog,
    bazarrLog,
    actionLog,
    nzbdavDockerLog,
    usage
  ] = await Promise.all([
    dockerContainers(),
    arrHealth('sonarr'),
    arrHealth('radarr'),
    arrQueue('sonarr'),
    arrQueue('radarr'),
    wantedCounts('sonarr'),
    wantedCounts('radarr'),
    nzbdavQueue(),
    bazarrProviders(),
    mountStatus(),
    readTail(config.paths.verifierLog),
    readTail(config.paths.periodicLog),
    readTail(config.paths.watchdogLog),
    readTail(config.paths.rcloneLog),
    readTail(config.paths.bazarrLog),
    readTail(config.paths.actionLog),
    dockerLogs('InfiniDysk', 86400),
    nzbdavUsage(force)
  ]);

  const verifier = parseVerifier(recentLines(verifierLog, 600));
  const periodic = parsePeriodic(recentLines(periodicLog, 400));
  const nzbdavProblems = parseProblemLines([
    ...recentLines(rcloneLog, 250),
    ...recentLines(nzbdavDockerLog, 650)
  ]);
  const bazarrProblems = parseProblemLines(recentLines(bazarrLog, 500));
  const watchdogLines = recentLines(watchdogLog, 120);
  const attention = parseAttentionEvents([
    { name: 'InfiniDysk docker', lines: recentLines(nzbdavDockerLog, 900) },
    { name: 'Periodic search', lines: recentLines(periodicLog, 500) },
    { name: 'Integrity verifier', lines: recentLines(verifierLog, 700) },
    { name: 'Mount watchdog', lines: watchdogLines },
    { name: 'rclone', lines: recentLines(rcloneLog, 260) },
    { name: 'Bazarr', lines: recentLines(bazarrLog, 300) }
  ]);
  const allIncidents = buildIncidents(attention.recent);
  const repairRuns = verifier.runs.filter((run) => run.ended);
  verifier.summary = {
    runs: repairRuns.length,
    succeeded: repairRuns.filter((run) => Number(run.repairs || 0) > 0).length,
    clean: repairRuns.filter((run) => Number(run.repairs || 0) === 0).length,
    failed: repairRuns.filter((run) => !run.ended).length,
    repairs: repairRuns.reduce((sum, run) => sum + Number(run.repairs || 0), 0),
    period: `laatste ${repairRuns.length} verifier-runs`
  };

  const serviceIncidents = [];
  if (mounts.overall === 'incident') serviceIncidents.push({ fingerprint: 'mount-read-check', id: 'mount-read-check', title: 'WebDAV-mount niet leesbaar', severity: 'critical', area: 'Mount', advice: 'Controleer rclone/InfiniDysk en voer daarna de watchdog uit.', source: 'Live read-test', subject: 'Een of meer read-only paden ontbreken of time-outen.', firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), count: 1, active: true, resolvedAt: null });
  for (const health of [sonarrHealth, radarrHealth]) if (!health.reachable) serviceIncidents.push({ fingerprint: `api-${health.app}`, id: 'api-unreachable', title: `${health.app[0].toUpperCase() + health.app.slice(1)} API niet bereikbaar`, severity: 'critical', area: 'Arr API', advice: 'Controleer container, netwerk en API-configuratie.', source: 'Live API-check', subject: `HTTP ${health.status || 0}`, firstSeen: health.checkedAt, lastSeen: health.checkedAt, count: 1, active: true, resolvedAt: null });
  const snapshot = {
    generatedAt: new Date().toISOString(),
    containers,
    health: { sonarr: sonarrHealth, radarr: radarrHealth },
    queues: { sonarr: sonarrQueue, radarr: radarrQueue, nzbdav },
    wanted: { sonarr: sonarrWanted, radarr: radarrWanted },
    bazarr,
    links: config.links,
    mounts,
    repairs: verifier,
    periodic,
    attention,
    incidents: {
      active: [...serviceIncidents, ...allIncidents.filter((incident) => incident.active)],
      resolved: allIncidents.filter((incident) => !incident.active && incident.id === 'repair-action'),
      historical: allIncidents.filter((incident) => !incident.active),
      rules: 'Providertrip/mount: 1 uur; import: 2 uur; missing/corrupt: 6 uur; searchlimiet: 12 uur; succesvolle automation direct opgelost.'
    },
    usage,
    problems: {
      nzbdav: nzbdavProblems,
      bazarr: bazarrProblems,
      recent: [...nzbdavProblems.problems, ...bazarrProblems.problems].slice(-200)
    },
    logs: {
      verifier: recentLines(verifierLog, 120),
      periodic: recentLines(periodicLog, 120),
      watchdog: watchdogLines,
      actions: recentLines(actionLog, 160),
      nzbdav: recentLines(nzbdavDockerLog, 160),
      bazarr: recentLines(bazarrLog, 160)
    }
  };
  snapshot.providers = providerPerformance(attention);
  snapshot.chain = buildChain(snapshot);
  snapshot.overview = classifyOverview(snapshot);
  snapshot.history = await recordMetrics(snapshot);
  lastSnapshot = snapshot;
  lastSnapshotAt = now;
  return lastSnapshot;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let filePath = path.normalize(path.join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!filePath.startsWith(publicDir)) return sendText(res, 403, 'Forbidden');
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/action' && req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return sendJson(res, 403, { ok: false, error: 'Cross-origin acties zijn niet toegestaan' });
      } catch { return sendJson(res, 403, { ok: false, error: 'Ongeldige Origin-header' }); }
    }
    const body = await readJsonBody(req);
    const result = await runAction(body);
    return sendJson(res, result.status || (result.ok ? 200 : 400), result);
  }
  if (url.pathname === '/api/snapshot') {
    const snapshot = await buildSnapshot(url.searchParams.get('force') === '1');
    return sendJson(res, 200, snapshot);
  }
  if (url.pathname === '/api/logs') {
    const snapshot = await buildSnapshot();
    const type = url.searchParams.get('type') || 'verifier';
    return sendJson(res, 200, { type, lines: snapshot.logs[type] || [] });
  }
  if (url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, generatedAt: new Date().toISOString() });
  }
  return serveStatic(req, res);
}

await loadConfig();
const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => sendJson(res, 500, { error: error.message }));
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Remco's 'Arr + InfiniDysk monitoring tool listening on http://0.0.0.0:${config.port}`);
});

setInterval(async () => {
  if (measurementRunning) return;
  measurementRunning = true;
  try { await buildSnapshot(true); } catch (error) { console.error('Background measurement failed:', error.message); }
  finally { measurementRunning = false; }
}, Math.max(1, Number(config.monitoring.sampleMinutes || 5)) * 60000).unref();
