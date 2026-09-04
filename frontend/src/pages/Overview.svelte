<script>
  import OverallStatus from '../components/OverallStatus.svelte';
  import StatusCard from '../components/StatusCard.svelte';
  import Pipeline from '../components/Pipeline.svelte';
  import IncidentList from '../components/IncidentList.svelte';
  import TrendCard from '../components/TrendCard.svelte';
  import { t } from '../lib/i18n.js';
  import { number, relTime } from '../lib/format.js';
  import { selectPrimaryAttention, selectCriticalBanner } from '../lib/dashboard-ui.js';
  import { openDrawer, snapshot } from '../lib/stores.js';
  import { navigate } from '../lib/route.js';

  const DRAWER_KIND = { incidents: 'incidents', queues: 'queues', providers: 'providers', mount: 'mount', containers: 'containers', repairs: 'repairs' };

  $: s = $snapshot;
  $: cards = buildCards(s);
  $: banner = s ? selectCriticalBanner(s) : null;
  $: primary = s ? selectPrimaryAttention(s) : null;
  $: history = s?.history || {};
  $: points24 = history.points24h || [];

  const arrStatus = (health) => health?.reachable === undefined ? 'disabled' : !health?.reachable ? 'incident' : health?.ok ? 'healthy' : 'degraded';

  function buildCards(s) {
    if (!s) return [];
    const sonarr = s.health?.sonarr || {};
    const radarr = s.health?.radarr || {};
    const nzbdav = s.queues?.nzbdav || {};
    const plex = (s.containers || []).find((container) => /plex/i.test(container.name));
    const jellyfin = (s.containers || []).find((container) => /jellyfin/i.test(container.name));
    const mediaApp = plex || jellyfin;
    const mounts = s.mounts || {};
    const dockerOk = s.docker?.reachable !== false;
    const containers = s.containers || [];
    const unhealthy = containers.filter((container) => !container.ok || container.health === 'unhealthy').length;
    return [
      {
        id: 'sonarr', title: 'Sonarr', status: arrStatus(sonarr),
        value: `${number(s.queues?.sonarr?.total ?? 0)} items`,
        note: sonarr.reachable ? `API ${number(sonarr.latencyMs)} ms` : t('sourceUnavailable')
      },
      {
        id: 'radarr', title: 'Radarr', status: arrStatus(radarr),
        value: `${number(s.queues?.radarr?.total ?? 0)} items`,
        note: radarr.reachable ? `API ${number(radarr.latencyMs)} ms` : t('sourceUnavailable')
      },
      {
        id: 'infinidysk', title: 'InfiniDysk / NZBDav',
        status: !nzbdav.ok ? 'incident' : nzbdav.failed ? 'incident' : nzbdav.stalled ? 'degraded' : 'healthy',
        value: `${number(nzbdav.total ?? 0)} items`,
        note: nzbdav.ok
          ? t('queueSummary', { active: number(nzbdav.active || 0), stalled: number(nzbdav.stalled || 0), minutes: number(nzbdav.oldestMinutes || 0) })
          : t('sourceUnavailable')
      },
      {
        id: 'media', title: plex ? 'Plex' : jellyfin ? 'Jellyfin' : 'Plex / Jellyfin',
        status: !mediaApp ? 'disabled' : mediaApp.ok ? (mediaApp.health && mediaApp.health !== 'healthy' ? 'degraded' : 'healthy') : 'incident',
        value: !mediaApp ? t('notConfigured') : mediaApp.status || t('unknown'),
        note: !mediaApp ? t('noContainersHelp') : `${t('restarts')}: ${number(mediaApp.restartCount)}`
      },
      {
        id: 'mount', title: t('webdavMount'),
        status: mounts.enabled === false ? 'disabled' : mounts.overall || 'unknown',
        value: mounts.enabled === false ? t('notConfigured') : `${number(mounts.maxLatencyMs)} ms`,
        note: mounts.enabled === false ? t('notConfigured') : `${t('lastKnownGood')}: ${mounts.lastKnownGood ? relTime(mounts.lastKnownGood) : '–'}`
      },
      {
        id: 'docker', title: t('system'),
        status: !dockerOk ? 'incident' : !containers.length ? 'disabled' : unhealthy ? 'degraded' : 'healthy',
        value: `${number(containers.filter((container) => container.ok).length)} / ${number(containers.length)}`,
        note: dockerOk ? t('containers') : t('noContainersHelp')
      }
    ];
  }

  function openCard(card) {
    if (!s) return;
    if (card.id === 'sonarr' || card.id === 'radarr') openDrawer('service', { kind: card.id, snapshot: s }, card.title);
    else if (card.id === 'infinidysk') openDrawer('service', { kind: 'infinidysk', snapshot: s }, card.title);
    else if (card.id === 'media') openDrawer('containers', (s.containers || []).filter((container) => /plex|jellyfin/i.test(container.name)), card.title);
    else if (card.id === 'mount') openDrawer('mount', s.mounts, t('mountReadTests'));
    else openDrawer('containers', s.containers || [], t('containers'));
  }

  function openBanner() {
    if (!banner || !s) return;
    navigate(`#${banner.tab || 'incidents'}`);
    openDrawer(DRAWER_KIND[banner.detail] || 'incidents', s, banner.title);
  }

  const queueTotal = (point) => Object.values(point.queue || {}).reduce((sum, queue) => sum + Number(queue.total || 0), 0);
</script>

{#if s}
  <div class="grid">
    <div class="hero-row">
      <OverallStatus overview={s.overview || {}} updatedAt={s.generatedAt} />
      {#if banner}
        <button type="button" class="banner {banner.severity}" on:click={openBanner}>
          <span class="bang" aria-hidden="true">!</span>
          <span class="copy">
            <strong>{banner.title}</strong>
            <small>{banner.source} · {banner.advice}</small>
          </span>
          <span class="go" aria-hidden="true">›</span>
        </button>
      {/if}
    </div>

    <div class="cards">
      {#each cards as card (card.id)}
        <StatusCard title={card.title} value={card.value} note={card.note} status={card.status} onopen={() => openCard(card)} />
      {/each}
    </div>

    <section class="panel recommendation">
      <p class="eyebrow">{t('recommendedNext')}</p>
      <h2>{primary?.title || t('allClear')}</h2>
      <p class="advice">{primary?.advice || t('pipelineClear')}</p>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">{t('causeEffect')}</p>
          <h2>{t('mediaPipeline')}</h2>
        </div>
        <span class="hint">{t('pipelineHelp')}</span>
      </div>
      <Pipeline chain={s.chain || []} />
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">{t('priority')}</p>
          <h2>{t('incidents')}</h2>
        </div>
        <button type="button" class="link" on:click={() => navigate('#incidents')}>{t('incidents')} ›</button>
      </div>
      <IncidentList incidents={s.incidents?.active || []} limit={5} />
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">{t('periodHeading')}</p>
          <h2>{t('keyTrends')}</h2>
        </div>
        <span class="hint">{t('historyMeta', { minutes: number(history.sampleMinutes), days: number(history.retentionDays) })}</span>
      </div>
      <div class="trends">
        <TrendCard title={t('queueActivity')} points={points24} getter={queueTotal} trend={history.activityTrend} />
        <TrendCard title={t('problemScore')} points={points24} getter={(point) => point.problemScore} trend={history.problemTrend} />
        <TrendCard title={t('mountLatency')} points={points24} getter={(point) => point.mount?.latencyMs} />
      </div>
    </section>
  </div>
{:else}
  <p class="loading">{t('loadingSnapshot')}</p>
{/if}

<style>
  .grid { display: flex; flex-direction: column; gap: 14px; }
  .hero-row { display: flex; flex-direction: column; gap: 10px; }
  .banner {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    background: var(--err-soft);
    border: 1px solid transparent;
    border-radius: var(--radius);
    padding: 10px 14px;
    font: inherit;
    color: var(--text);
  }
  .banner.warning { background: var(--warn-soft); }
  .bang {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--err);
    color: #fff;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    font-size: 13px;
  }
  .banner.warning .bang { background: var(--warn); }
  .copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .copy strong { font-size: 13px; }
  .copy small { font-size: 11.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .go { margin-left: auto; color: var(--text-faint); font-size: 16px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 10px; }
  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .eyebrow { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); margin-bottom: 2px; }
  h2 { font-size: 14px; font-weight: 650; }
  .hint { font-size: 11px; color: var(--text-faint); }
  .link { background: none; border: none; color: var(--accent); font-size: 12px; padding: 2px; }
  .recommendation h2 { font-size: 15px; }
  .advice { font-size: 12.5px; color: var(--text-muted); }
  .trends { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
  .loading { color: var(--text-muted); padding: 30px 4px; }
</style>
