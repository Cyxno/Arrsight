<script>
  import QueueCard from '../components/QueueCard.svelte';
  import TrendCard from '../components/TrendCard.svelte';
  import IncidentList from '../components/IncidentList.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import { t } from '../lib/i18n.js';
  import { number } from '../lib/format.js';
  import { attentionItems } from '../lib/dashboard-ui.js';
  import { snapshot } from '../lib/stores.js';

  $: s = $snapshot;
  $: points24 = s?.history?.points24h || [];
  $: repairs = s?.repairs?.summary || {};
  $: counts = s?.periodic?.counts || {};
  $: searches = ['sonarr_missing', 'sonarr_upgrade', 'radarr_missing', 'radarr_upgrade'].reduce((sum, key) => sum + Number(counts[key] || 0), 0);
  $: downloadAttention = attentionItems(s || {}).filter((item) => item.tab === 'downloads');

  const queueTotal = (point) => Object.values(point.queue || {}).reduce((sum, queue) => sum + Number(queue.total || 0), 0);
  const queueStalled = (point) => Object.values(point.queue || {}).reduce((sum, queue) => sum + Number(queue.stalled || 0), 0);
  const queueFailed = (point) => Object.values(point.queue || {}).reduce((sum, queue) => sum + Number(queue.failed || 0), 0);
</script>

{#if s}
  <div class="grid">
    <p class="intro">{t('downloadIntro')}</p>

    <div class="queues">
      <QueueCard title="Sonarr" queue={s.queues?.sonarr || {}} />
      <QueueCard title="Radarr" queue={s.queues?.radarr || {}} />
      <QueueCard title="InfiniDysk" queue={s.queues?.nzbdav || {}} />
    </div>

    <section class="panel">
      <div class="section-head"><p class="eyebrow">{t('backlog')}</p><h2>{t('wanted')}</h2></div>
      <div class="wanted">
        {#each [['Sonarr · missing', s.wanted?.sonarr?.missing], ['Sonarr · cutoff', s.wanted?.sonarr?.cutoff], ['Radarr · missing', s.wanted?.radarr?.missing], ['Radarr · cutoff', s.wanted?.radarr?.cutoff]] as [label, value] (label)}
          <div class="wanted-card">
            <StatusBadge status={value === null || value === undefined ? 'unknown' : value === 0 ? 'healthy' : 'active'} compact />
            <strong>{number(value)}</strong>
            <span>{label}</span>
          </div>
        {/each}
      </div>
    </section>

    <section class="panel">
      <div class="section-head"><p class="eyebrow">{t('automation')}</p><h2>{t('repairsSearches')}</h2></div>
      <div class="repair-stats">
        <div class="stat"><small>{t('verifierRuns')}</small><strong>{number(repairs.runs)}</strong></div>
        <div class="stat"><small>{t('repairs')}</small><strong>{number(repairs.repairs)}</strong></div>
        <div class="stat"><small>{t('clean')}</small><strong>{number(repairs.clean)}</strong></div>
        <div class="stat"><small>{t('succeeded')}</small><strong>{number(repairs.succeeded)}</strong></div>
        <div class="stat"><small>{t('incomplete')}</small><strong>{number(repairs.incomplete)}</strong></div>
        <div class="stat"><small>{t('failed')}</small><strong>{number(repairs.failed)}</strong></div>
        <div class="stat"><small>{t('searchEvents')}</small><strong>{number(searches)}</strong></div>
        <div class="stat"><small>{t('backoffs')}</small><strong>{number(counts.radarr_missing_backoff)}</strong></div>
      </div>
    </section>

    {#if downloadAttention.length}
      <section class="panel">
        <div class="section-head"><p class="eyebrow">{t('attention')}</p><h2>{t('queues')}</h2></div>
        <IncidentList incidents={downloadAttention} limit={8} />
      </section>
    {/if}

    <section class="panel">
      <div class="section-head"><p class="eyebrow">{t('history')}</p><h2>{t('queueTrends')}</h2></div>
      <div class="trends">
        <TrendCard title={t('queueActivity')} points={points24} getter={queueTotal} trend={s.history?.activityTrend} />
        <TrendCard title={t('degraded')} points={points24} getter={queueStalled} />
        <TrendCard title={t('failed')} points={points24} getter={queueFailed} />
      </div>
    </section>
  </div>
{:else}
  <p class="loading">{t('loadingSnapshot')}</p>
{/if}

<style>
  .grid { display: flex; flex-direction: column; gap: 14px; }
  .intro { color: var(--text-muted); font-size: 12.5px; }
  .queues { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .section-head { display: flex; flex-direction: column; gap: 1px; }
  .eyebrow { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); }
  h2 { font-size: 14px; font-weight: 650; }
  .wanted { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .wanted-card { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-small); padding: 10px 12px; }
  .wanted-card strong { font-size: 19px; font-weight: 650; }
  .wanted-card span { font-size: 11px; color: var(--text-muted); }
  .repair-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
  .stat { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-small); padding: 9px 11px; display: flex; flex-direction: column; gap: 2px; }
  .stat small { font-size: 10.5px; color: var(--text-faint); }
  .stat strong { font-size: 16px; font-weight: 650; }
  .trends { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
  .loading { color: var(--text-muted); padding: 30px 4px; }
</style>
