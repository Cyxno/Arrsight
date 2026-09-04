<script>
  import StatusBadge from './StatusBadge.svelte';
  import { t, getLocale } from '../lib/i18n.js';
  import { number } from '../lib/format.js';
  import { openDrawer } from '../lib/stores.js';

  export let title = '';
  export let queue = {};

  $: status = !queue.ok ? 'unknown' : queue.failed ? 'incident' : queue.stalled ? 'degraded' : queue.total ? 'active' : 'healthy';
  $: note = queue.ok
    ? t('queueSummary', { active: number(queue.active), stalled: number(queue.stalled), minutes: number(queue.oldestMinutes || 0) })
    : t('sourceUnavailable');
</script>

<button type="button" class="queue-card {status}" on:click={() => openDrawer('queues', { source: title.toLowerCase() }, title)}>
  <div class="head">
    <strong>{title}</strong>
    <StatusBadge status={status} compact />
  </div>
  <div class="figures">
    <span class="total">{number(queue.total ?? 0)}<small>{getLocale() === 'nl' ? ' items' : ' items'}</small></span>
    <span class="chips">
      <span class="chip">{t('active')} {number(queue.active ?? 0)}</span>
      <span class="chip warn" class:zero={!queue.stalled}>{t('degraded')} {number(queue.stalled ?? 0)}</span>
      <span class="chip err" class:zero={!queue.failed}>{t('failed')} {number(queue.failed ?? 0)}</span>
    </span>
  </div>
  <small class="note">{note}</small>
</button>

<style>
  .queue-card {
    display: flex;
    flex-direction: column;
    gap: 7px;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
    font: inherit;
    color: inherit;
    transition: border-color 120ms ease, transform 120ms ease;
  }
  .queue-card:hover { border-color: var(--border-strong); transform: translateY(-1px); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .head strong { font-size: 13px; }
  .figures { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .total { font-size: 20px; font-weight: 650; letter-spacing: -0.01em; }
  .total small { font-size: 11px; font-weight: 500; color: var(--text-faint); margin-left: 2px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip {
    font-size: 10.5px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--info-soft);
    color: var(--info);
  }
  .chip.warn { background: var(--warn-soft); color: var(--warn); }
  .chip.err { background: var(--err-soft); color: var(--err); }
  .chip.zero { opacity: 0.45; }
  .note { font-size: 11.5px; color: var(--text-muted); }
</style>
