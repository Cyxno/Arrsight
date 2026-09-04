import fs from 'node:fs/promises';
import { parseOperationalHistory, pruneHistory } from './telemetry.js';

export const USAGE_MAX_ATTRIBUTION_MS = 15 * 60 * 1000;

// Serialized atomic writer per file so concurrent snapshot builds cannot
// interleave temporary files or partial histories.
function queuedJsonStore(file, { pretty = false, label = 'History' } = {}) {
  let queue = Promise.resolve();
  const write = async (value) => {
    const temporary = `${file}.${process.pid}.tmp`;
    const body = pretty ? `${JSON.stringify(value, null, 2)}\n` : `${JSON.stringify(value)}\n`;
    await fs.writeFile(temporary, body, { mode: 0o600 });
    await fs.rename(temporary, file);
  };
  return {
    write(value) {
      queue = queue.then(() => write(value)).catch((error) => console.error(`${label} write failed:`, error.message));
      return queue;
    }
  };
}

export function createHistoryStores({ usageHistoryPath, metricsHistoryPath, incidentHistoryPath }) {
  const usage = queuedJsonStore(usageHistoryPath, { pretty: true, label: 'Usage history' });
  const metrics = queuedJsonStore(metricsHistoryPath, { label: 'Metrics history' });
  const incidents = queuedJsonStore(incidentHistoryPath, { label: 'Incident history' });
  return { usage, metrics, incidents };
}

export async function readUsageHistory(usageHistoryPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(usageHistoryPath, 'utf8'));
    return {
      version: 1,
      last: parsed.last || null,
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch {
    return { version: 1, last: null, entries: [] };
  }
}

export async function readMetricsHistory(metricsHistoryPath, retentionDays) {
  try {
    const parsed = JSON.parse(await fs.readFile(metricsHistoryPath, 'utf8'));
    return { version: 1, points: pruneHistory(parsed.points, new Date(), retentionDays) };
  } catch {
    return { version: 1, points: [] };
  }
}

export async function readIncidentHistory(incidentHistoryPath) {
  try {
    return parseOperationalHistory(await fs.readFile(incidentHistoryPath, 'utf8'));
  } catch { return parseOperationalHistory(''); }
}

export function networkTotals(stats) {
  const networks = stats?.networks || {};
  let rxBytes = 0;
  let txBytes = 0;
  for (const network of Object.values(networks)) {
    rxBytes += Number(network.rx_bytes || 0);
    txBytes += Number(network.tx_bytes || 0);
  }
  return { rxBytes, txBytes, totalBytes: rxBytes + txBytes };
}

export function startOfPeriod(date, period) {
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

export function sumUsage(entries, since) {
  return entries
    .filter((entry) => new Date(entry.at).getTime() >= since.getTime() && entry.attributed !== false)
    .reduce((acc, entry) => ({
      rxBytes: acc.rxBytes + Number(entry.rxDelta || 0),
      txBytes: acc.txBytes + Number(entry.txDelta || 0),
      totalBytes: acc.totalBytes + Number(entry.totalDelta || 0)
    }), { rxBytes: 0, txBytes: 0, totalBytes: 0 });
}

export function sumUnattributedUsage(entries, since) {
  return entries
    .filter((entry) => new Date(entry.at).getTime() >= since.getTime() && entry.attributed === false)
    .reduce((acc, entry) => ({
      rxBytes: acc.rxBytes + Number(entry.rxDelta || 0),
      txBytes: acc.txBytes + Number(entry.txDelta || 0),
      totalBytes: acc.totalBytes + Number(entry.totalDelta || 0)
    }), { rxBytes: 0, txBytes: 0, totalBytes: 0 });
}
