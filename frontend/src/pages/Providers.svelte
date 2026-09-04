<script>
  import ProviderCard from '../components/ProviderCard.svelte';
  import TrendCard from '../components/TrendCard.svelte';
  import IncidentList from '../components/IncidentList.svelte';
  import { t } from '../lib/i18n.js';
  import { number } from '../lib/format.js';
  import { incidentTab } from '../lib/dashboard-ui.js';
  import { snapshot } from '../lib/stores.js';

  $: s = $snapshot;
  $: providers = s?.providers || [];
  $: providerIncidents = (s?.incidents?.active || []).filter((incident) => incidentTab(incident) === 'providers');
  $: nzbdavCounts = s?.problems?.nzbdav?.counts || {};
  $: points24 = s?.history?.points24h || [];
  $: providerSignal = (point) => ['provider-trip', 'single-provider', 'missing-articles'].reduce((sum, key) => sum + Number(point.incidents?.[key] || 0), 0);
</script>

{#if s}
  <div class="grid">
    <p class="intro">{t('providerIntro')}</p>

    {#if providers.length}
      <div class="providers">
        {#each providers as provider (provider.name)}
          <ProviderCard provider={provider} />
        {/each}
      </div>
    {:else}
      <section class="panel empty-panel">
        <h2>{t('providerEmpty')}</h2>
        <p class="muted">{t('providerEmptyHelp')}</p>
      </section>
    {/if}

    <section class="panel">
      <div class="section-head"><p class="eyebrow">{t('attention')}</p><h2>{t('providerIncidents')}</h2></div>
      {#if providerIncidents.length}
        <IncidentList incidents={providerIncidents} />
      {:else}
        <p class="muted">{t('noProviderIncidents')} {t('noRecentProvider')}</p>
      {/if}
    </section>

    <section class="panel">
      <div class="section-head"><p class="eyebrow">{t('derivedLogs')}</p><h2>{t('recentProblems')}</h2></div>
      <div class="signals">
        {#each [['missingArticles', nzbdavCounts.missingArticles], ['timeout', nzbdavCounts.timeout], ['providerLimit', nzbdavCounts.providerLimit], ['notFound', nzbdavCounts.notFound], ['stuck', nzbdavCounts.stuck], ['pathMissing', nzbdavCounts.pathMissing]] as [key, value] (key)}
          <div class="signal" class:zero={!value}>
            <strong>{number(value)}</strong>
            <span>{key}</span>
          </div>
        {/each}
      </div>
    </section>

    <section class="panel">
      <div class="section-head"><p class="eyebrow">{t('history')}</p><h2>{t('providerTrends')}</h2></div>
      {#if points24.some((point) => providerSignal(point) > 0)}
        <div class="trends">
          <TrendCard title={t('providerIncidents')} points={points24} getter={providerSignal} />
        </div>
      {:else}
        <p class="muted">{t('providerHistoryInsufficient')}</p>
      {/if}
    </section>
  </div>
{:else}
  <p class="loading">{t('loadingSnapshot')}</p>
{/if}

<style>
  .grid { display: flex; flex-direction: column; gap: 14px; }
  .intro { color: var(--text-muted); font-size: 12.5px; }
  .providers { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .empty-panel h2 { font-size: 14px; }
  .section-head { display: flex; flex-direction: column; gap: 1px; }
  .eyebrow { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); }
  h2 { font-size: 14px; font-weight: 650; }
  .signals { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
  .signal { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-small); padding: 9px 11px; display: flex; flex-direction: column; gap: 2px; }
  .signal strong { font-size: 16px; font-weight: 650; color: var(--warn); }
  .signal.zero strong { color: var(--text-faint); }
  .signal span { font-size: 11px; color: var(--text-muted); }
  .trends { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
  .muted { color: var(--text-muted); font-size: 12.5px; }
  .loading { color: var(--text-muted); padding: 30px 4px; }
</style>
