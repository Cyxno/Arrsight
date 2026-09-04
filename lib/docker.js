import { dockerSocketRequest } from './http.js';

// Legacy spelling used before the download-client container name became
// configurable; kept as a fallback so existing installs keep reporting usage.
const LEGACY_DOWNLOAD_CLIENT = 'InfiniDysk';

export function downloadClientContainerName(config) {
  return config?.infinidysk?.containerName || 'infinidysk';
}

export function createDockerService(getConfig) {
  async function request(endpoint, method = 'GET') {
    return dockerSocketRequest(getConfig().dockerSocket, endpoint, method);
  }

  async function json(endpoint) {
    const result = await request(endpoint);
    if (!result.ok) return { ok: false, status: result.status, error: result.text };
    try {
      return { ok: true, status: result.status, data: JSON.parse(result.text) };
    } catch {
      return { ok: false, status: result.status, error: 'Invalid Docker JSON' };
    }
  }

  async function post(endpoint) {
    const result = await request(endpoint, 'POST');
    return { ok: result.ok, status: result.status, text: result.text };
  }

  function inspect(name) {
    return json(`/containers/${encodeURIComponent(name)}/json`);
  }

  // Resolve the download-client container: prefer the configured name, fall
  // back to the legacy hard-coded spelling when only that one exists.
  async function inspectDownloadClient() {
    const configured = downloadClientContainerName(getConfig());
    const primary = await inspect(configured);
    if (primary.ok || configured === LEGACY_DOWNLOAD_CLIENT) return { name: configured, info: primary };
    const legacy = await inspect(LEGACY_DOWNLOAD_CLIENT);
    return legacy.ok ? { name: LEGACY_DOWNLOAD_CLIENT, info: legacy } : { name: configured, info: primary };
  }

  async function downloadClientStats() {
    const { name, info } = await inspectDownloadClient();
    if (!info.ok) return { name, info, stats: { ok: false, status: info.status, error: info.error } };
    const stats = await json(`/containers/${encodeURIComponent(name)}/stats?stream=false`);
    return { name, info, stats };
  }

  async function downloadClientLogs(sinceSeconds) {
    const { name } = await inspectDownloadClient();
    return logs(name, sinceSeconds);
  }

  async function containers(previousRestarts = {}) {
    const list = [];
    let reachable = true;
    for (const name of getConfig().containers) {
      const info = await inspect(name);
      if (!info.ok && /socket|connect|timeout/i.test(info.error || '')) reachable = false;
      const restartCount = Number(info.data?.RestartCount || 0);
      list.push({
        name,
        exists: info.ok,
        ok: Boolean(info.ok && info.data?.State?.Running),
        status: info.data?.State?.Status || info.error || 'unknown',
        health: info.data?.State?.Health?.Status || null,
        startedAt: info.data?.State?.StartedAt || null,
        restartCount,
        restartIncreased: Number.isFinite(previousRestarts[name]) && restartCount > previousRestarts[name],
        checkedAt: new Date().toISOString()
      });
    }
    return { containers: list, reachable, restartCounts: Object.fromEntries(list.map((container) => [container.name, container.restartCount])) };
  }

  async function logs(name, sinceSeconds = 86400) {
    const since = Math.floor(Date.now() / 1000) - sinceSeconds;
    const result = await request(`/containers/${encodeURIComponent(name)}/logs?stdout=1&stderr=1&timestamps=1&since=${since}`);
    return result.ok ? result.text : '';
  }

  return { request, json, post, inspect, inspectDownloadClient, downloadClientStats, downloadClientLogs, containers, logs };
}
