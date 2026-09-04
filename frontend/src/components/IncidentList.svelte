<script>
  import { fade, fly } from 'svelte/transition';
  import { t } from '../lib/i18n.js';
  import { number, relTime } from '../lib/format.js';

  export let incidents = [];
  export let limit = 0;

  $: list = limit ? incidents.slice(0, limit) : incidents;

  function severityClass(item) {
    if (!item.active) return 'resolved';
    return item.severity === 'critical' ? 'critical' : 'warning';
  }
</script>

{#if list.length}
  <ul class="incident-list">
    {#each list as item (item.fingerprint || item.key || item.title)}
      <li class="incident {severityClass(item)}" in:fly={{ y: 6, duration: 140 }} out:fade={{ duration: 80 }}>
        <span class="marker" aria-hidden="true"></span>
        <div class="copy">
          <strong>{item.title}</strong>
          <p class="meta">
            <span class="source">{item.source || t('unknownSource')}</span>
            {#if item.area}<span>· {item.area}</span>{/if}
            <span>· {t('firstSeen')} {relTime(item.firstSeen)}</span>
            <span>· {t('lastSeen')} {relTime(item.lastSeen)}</span>
            {#if item.count > 1}<span class="count">{t('occurrences', { count: number(item.count) })}</span>{/if}
          </p>
          {#if item.advice}<p class="advice">{item.advice}</p>{/if}
        </div>
        <span class="when">{item.active ? t('active') : t('resolved')}</span>
      </li>
    {/each}
  </ul>
{:else}
  <p class="empty">{t('noItems')}</p>
{/if}

<style>
  .incident-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .incident {
    display: flex;
    gap: 11px;
    padding: 10px 4px;
    border-bottom: 1px solid var(--border);
    align-items: flex-start;
  }
  .incident:last-child { border-bottom: none; }
  .marker { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; background: var(--text-faint); }
  .incident.critical .marker { background: var(--err); }
  .incident.warning .marker { background: var(--warn); }
  .incident.resolved .marker { background: var(--ok); }
  .incident.resolved .copy strong { color: var(--text-muted); }
  .copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .copy strong { font-size: 13px; font-weight: 600; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px; font-size: 11.5px; color: var(--text-muted); }
  .source { font-weight: 600; }
  .count { color: var(--text-faint); }
  .advice { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  .when { font-size: 11px; font-weight: 600; color: var(--text-faint); white-space: nowrap; margin-top: 3px; }
  .incident.critical .when { color: var(--err); }
  .empty { color: var(--text-muted); font-size: 12.5px; padding: 8px 2px; }
</style>
