<script>
  import StatusBadge from './StatusBadge.svelte';
  import { t } from '../lib/i18n.js';
  import { number, relTime } from '../lib/format.js';
  import { openDrawer } from '../lib/stores.js';

  export let provider = {};
</script>

<button type="button" class="provider-card {provider.status || 'unknown'}" on:click={() => openDrawer('providers', { name: provider.name }, provider.name)}>
  <div class="head">
    <strong>{provider.name}</strong>
    <StatusBadge status={provider.status || 'unknown'} compact />
  </div>
  <div class="stats">
    <span class="stat"><small>{t('trips')}</small>{number(provider.trips)}</span>
    <span class="stat"><small>{t('missingArticles')}</small>{number(provider.missingArticles)}</span>
    <span class="stat"><small>{t('lastTrip')}</small>{provider.lastTrip ? relTime(provider.lastTrip) : '–'}</span>
    <span class="stat"><small>{t('lastRecovery')}</small>{provider.lastRecovery ? relTime(provider.lastRecovery) : '–'}</span>
  </div>
</button>

<style>
  .provider-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
    font: inherit;
    color: inherit;
    transition: border-color 120ms ease, transform 120ms ease;
  }
  .provider-card:hover { border-color: var(--border-strong); transform: translateY(-1px); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .head strong { font-size: 13.5px; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .stat { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .stat small { font-size: 10.5px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stat { font-size: 13px; font-weight: 600; }
</style>
