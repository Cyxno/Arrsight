<script>
  import IncidentList from '../components/IncidentList.svelte';
  import { t } from '../lib/i18n.js';
  import { snapshot } from '../lib/stores.js';

  const TABS = ['active', 'resolved', 'historical'];
  let tab = 'active';

  $: s = $snapshot;
  $: incidents = s?.incidents?.[tab] || [];
  $: countFor = (key) => (s?.incidents?.[key] || []).length;
</script>

{#if s}
  <div class="grid">
    <div class="tabs" role="tablist" aria-label={t('incidents')}>
      {#each TABS as key (key)}
        <button
          type="button"
          role="tab"
          aria-selected={tab === key}
          class:active={tab === key}
          on:click={() => (tab = key)}
        >
          {t(key)}
          <span class="count">{countFor(key)}</span>
        </button>
      {/each}
    </div>

    <section class="panel">
      {#if tab === 'active' && !incidents.length}
        <h2>{t('noActiveIncidents')}</h2>
        <p class="muted">{t('pipelineClear')}</p>
        <IncidentList incidents={[]} />
      {:else if tab !== 'active' && !incidents.length}
        <p class="muted">{t('noItems')}</p>
      {:else}
        <IncidentList {incidents} />
      {/if}
    </section>
  </div>
{:else}
  <p class="loading">{t('loadingSnapshot')}</p>
{/if}

<style>
  .grid { display: flex; flex-direction: column; gap: 14px; }
  .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
  .tabs button {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    padding: 6px 13px;
    border-radius: 999px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
  }
  .tabs button.active { background: var(--accent-soft); border-color: transparent; color: var(--text); font-weight: 600; }
  .count { font-size: 10.5px; font-weight: 700; background: var(--surface-3); border-radius: 999px; padding: 1px 7px; color: var(--text-muted); }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 16px; }
  h2 { font-size: 14px; margin-top: 10px; }
  .muted { color: var(--text-muted); font-size: 12.5px; padding: 4px 0 10px; }
  .loading { color: var(--text-muted); padding: 30px 4px; }
</style>
