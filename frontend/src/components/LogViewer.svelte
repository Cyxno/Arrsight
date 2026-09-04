<script>
  import { t } from '../lib/i18n.js';
  import { api } from '../lib/api.js';
  import { snapshot } from '../lib/stores.js';

  export let initialSource = 'verifier';

  const SOURCES = [
    { id: 'verifier', key: 'logVerifier' },
    { id: 'periodic', key: 'logPeriodic' },
    { id: 'watchdog', key: 'logWatchdog' },
    { id: 'actions', key: 'actions' },
    { id: 'nzbdav', key: 'logNzbdav' },
    { id: 'bazarr', key: 'logBazarr' }
  ];

  let source = initialSource;
  let lines = [];
  let loading = false;
  let error = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function highlight(line) {
    let html = escapeHtml(line);
    html = html.replace(/^(\d{4}-\d{2}-\d{2}[T ][0-9:.+Z-]+)/, '<span class="ts">$1</span>');
    html = html.replace(/\b(error|fatal|failed|unreachable|corrupt)\b/gi, '<span class="sev-err">$1</span>');
    html = html.replace(/\b(warn(?:ing)?|timeout|timed out|stale|degraded|retry)\b/gi, '<span class="sev-warn">$1</span>');
    return html;
  }

  async function load() {
    loading = true;
    error = null;
    try {
      const value = await api.logs(source);
      lines = value.lines || [];
    } catch (err) {
      error = err;
      lines = $snapshot?.logs?.[source] || [];
    } finally {
      loading = false;
    }
  }

  $: source, load();
</script>

<div class="viewer">
  <div class="tools">
    <label>
      <span class="label">{t('logSource')}</span>
      <select bind:value={source} on:change={() => {}}>
        {#each SOURCES as item (item.id)}
          <option value={item.id}>{t(item.key)}</option>
        {/each}
      </select>
    </label>
    <button type="button" disabled={loading} on:click={load}>{loading ? '…' : t('refresh')}</button>
  </div>
  {#if error}<p class="error">{t('unavailable')} · {error.code || error.message}</p>{/if}
  <pre class="logbox" role="log" aria-live="off">{#if lines.length}{@html lines.map(highlight).join('\n')}{:else}{t('noLogLines')}{/if}</pre>
</div>

<style>
  .viewer { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
  .tools { display: flex; align-items: flex-end; gap: 10px; }
  .label { display: block; font-size: 11px; color: var(--text-faint); margin-bottom: 3px; }
  .tools button { font-size: 12px; }
  .error { color: var(--err); font-size: 12px; }
  .logbox {
    margin: 0;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
    font-family: var(--mono);
    font-size: 11.8px;
    line-height: 1.55;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: calc(100vh - 230px);
    min-height: 300px;
    color: var(--text-muted);
  }
  .logbox :global(.ts) { color: var(--text-faint); }
  .logbox :global(.sev-err) { color: var(--err); font-weight: 600; }
  .logbox :global(.sev-warn) { color: var(--warn); font-weight: 600; }
</style>
