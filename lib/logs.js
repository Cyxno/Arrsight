import fs from 'node:fs/promises';
import { severityWeight } from './telemetry.js';

export async function readTail(file, maxBytes = 180000) {
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

export function recentLines(text, count = 200) {
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

export function parseVerifier(lines) {
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
    if (/verifier (?:failed|error)|fatal/i.test(line) && current) current.failed = true;
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
  if (current) runs.push({ ...current, status: current.failed ? 'failed' : 'running' });
  return { runs: runs.slice(-24), repairs: repairs.slice(-100) };
}

export function parsePeriodic(lines) {
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

export function parseProblemLines(lines) {
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

// Log-derived attention rules. `id` and `test` are the contract; `title` and
// `advice` are neutral English fallbacks — the frontend localizes by `id`.
const ATTENTION_RULES = [
  {
    id: 'provider-trip',
    title: 'Provider trip / timeout',
    severity: 'critical',
    area: 'Usenet providers',
    advice: 'Watch provider timeouts and trips. If these accumulate: lower the connection count or temporarily disable the provider.',
    test: /Provider .*tripped|connection limit|read-timeout|TimeoutException|TooManyRequests|DownloadLimitExceeded/i
  },
  {
    id: 'single-provider',
    title: 'Only one provider used',
    severity: 'warning',
    area: 'Usenet providers',
    advice: 'The fallback is not being used or is ineligible. Check provider settings if missing articles keep increasing.',
    test: /EligibleProviders:\s*1\b/i
  },
  {
    id: 'missing-articles',
    title: 'Missing articles / DMCA',
    severity: 'warning',
    area: 'NZB health',
    advice: 'This is normal after takedowns. Investigate if the same title recurs or no 1080p fallback is selected.',
    test: /Missing articles|No Such Article|First segment .* missing|Article with message-id .* not found/i
  },
  {
    id: 'repair-action',
    title: 'Repair / blocklist action',
    severity: 'info',
    area: 'Repair flow',
    advice: 'This is usually expected: the broken release is removed or blocklisted and searched again.',
    test: /bad_import_queue_delete|failed_queue_delete|RemoveAndBlocklist|RemoveAndBlocklistAndSearch|sonarr_bad|radarr_bad|_delete file_id=/i
  },
  {
    id: 'import-stuck',
    title: 'Import stuck',
    severity: 'critical',
    area: 'Sonarr/Radarr import',
    advice: 'Completed/importPending or sample detection is stuck. Periodic cleanup should remove it and search again.',
    test: /importPending|Unable to determine if file is a sample|No files found are eligible for import|Failed to import|path does not exist|not accessible by (Sonarr|Radarr)/i
  },
  {
    id: 'fallback-rescue',
    title: 'Recent missing rescue',
    severity: 'info',
    area: 'New episodes',
    advice: 'The fallback rescue steps in for recent missing episodes and picks a lower or alternative release.',
    test: /sonarr_recent_rescue_(grab|skip|error)/i
  },
  {
    id: 'search-limit',
    title: 'Replacement limit reached',
    severity: 'warning',
    area: 'Search loop',
    advice: 'Too many broken releases were attempted. Check whether acceptable 720p/1080p releases remain available.',
    test: /Automatic replacement-search limit reached|no_untried_viable_release/i
  },
  {
    id: 'mount-watchdog',
    title: 'Mount/watchdog recovery',
    severity: 'warning',
    area: 'Mount',
    advice: 'The mount was stale or missing, or containers could not see it. Tighten rclone or watchdog checks if this recurs.',
    test: /stale|missing or stale|does not see .*restarting|not mounted|recovered|Backend proxy failed|ECONNRESET/i
  },
  {
    id: 'corrupt-media',
    title: 'Corrupt or unreadable media',
    severity: 'critical',
    area: 'Playback',
    advice: 'The file is not reliably playable. The repair or verifier job should remove it and search again.',
    test: /unreadable media|corrupt RAR|Corrupt file|EBML header|Invalid data found|gap-fill|decoded .* short/i
  },
  {
    id: 'queue-busy',
    title: 'Queue/backlog busy',
    severity: 'info',
    area: 'Load',
    advice: 'Scripts pause heavier checks while the download client is busy. Expected behavior, but prolonged busyness deserves attention.',
    test: /Backlog is busy|queue is busy|Skipping .* while InfiniDysk is busy|nzbdav_queue_count=\d+/i
  }
];

export function attentionRuleIds() {
  return ATTENTION_RULES.map((rule) => rule.id);
}

export function parseAttentionEvents(sources) {
  const events = [];
  for (const source of sources) {
    const lines = source.lines || [];
    for (const line of lines) {
      for (const rule of ATTENTION_RULES) {
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

  const grouped = new Map();
  for (const event of events) {
    const key = `${event.id}:${event.source}:${event.subject}`;
    const item = grouped.get(key) || { ...event, count: 0 };
    item.count += 1;
    item.line = event.line;
    grouped.set(key, item);
  }
  const byRule = [...grouped.values()];
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
  if (id === 'single-provider') return `${sourceName}: fallback provider not used`;
  if (/Usenet segment was unavailable/i.test(line)) return 'Usenet segment unavailable';
  if (/Article with message-id .* not found/i.test(line) && !/\/content\//i.test(line)) return 'Article not found';
  return extractTitle(line);
}

export function extractTitle(line) {
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
