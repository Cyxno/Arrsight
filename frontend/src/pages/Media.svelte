<script>
  import StatusCard from '../components/StatusCard.svelte';
  import IncidentList from '../components/IncidentList.svelte';
  import Pipeline from '../components/Pipeline.svelte';
  import { t } from '../lib/i18n.js';
  import { number, bytes } from '../lib/format.js';
  import { openDrawer, snapshot } from '../lib/stores.js';

  $: s = $snapshot;
  $: bazarr = s?.bazarr || {};
  $: plex = (s?.containers || []).find((container) => /plex/i.test(container.name));
  $: jellyfin = (s?.containers || []).find((container) => /jellyfin/i.test(container.name));
  $: mediaNodes = (s?.chain || []).filter((node) => ['library', 'bazarr', 'plex'].includes(node.id));
  $: mediaIncidents = (s?.incidents?.active || []).filter((incident) => /playback|subtitle|bazarr|plex|jellyfin|library|corrupt/i.test(`${incident.id || ''} ${incident.area || ''} ${incident.source || ''}`));

  function containerStatus(container) {
    if (!container) return 'disabled';
    if (!container.ok) return 'incident';
    if (container.health && container.health !== 'healthy') return 'degraded';
    return 'healthy';
  }
</script>

{#if s}
  <div class="grid">
    <div class="cards">
      <StatusCard
        title="Bazarr"
        status={bazarr.enabled === false ? 'disabled' : bazarr.ok ? 'healthy' : 'incident'}
        value={bazarr.enabled === false ? t('notConfigured') : `${number(bazarr.providers?.length ?? 0)} ${t('subtitles').toLowerCase()}`}
        note={bazarr.ok ? 'API ok' : bazarr.error || t('sourceUnavailable')}
        onopen={() => openDrawer('service', { kind: 'bazarr', snapshot: s }, 'Bazarr')}
      />
      <StatusCard
        title="Plex"
        status={containerStatus(plex)}
        value={plex ? plex.status || t('unknown') : t('notConfigured')}
        note={plex ? `${t('health')}: ${plex.health || t('noHealthcheck')}` : t('noContainersHelp')}
        onopen={() => openDrawer('containers', plex ? [plex] : [], 'Plex')}
      />
      <StatusCard
        title="Jellyfin"
        status={containerStatus(jellyfin)}
        value={jellyfin ? jellyfin.status || t('unknown') : t('notConfigured')}
        note={jellyfin ? `${t('health')}: ${jellyfin.health || t('noHealthcheck')}` : t('noContainersHelp')}
        onopen={() => openDrawer('containers', jellyfin ? [jellyfin] : [], 'Jellyfin')}
      />
      <StatusCard
        title={t('dataUsage')}
        status="active"
        value={bytes(s.usage?.periods?.daily?.totalBytes)}
        note={t('today')}
        onopen={() => openDrawer('service', { kind: 'infinidysk', snapshot: s }, t('dataUsage'))}
      />
    </div>

    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">{t('causeEffect')}</p>
          <h2>{t('playback')}</h2>
        </div>
        <span class="hint">{t('pipelineHelp')}</span>
      </div>
      <Pipeline chain={mediaNodes} />
    </section>

    <section class="panel">
      <div class="section-head"><p class="eyebrow">{t('attention')}</p><h2>{t('playback')}</h2></div>
      {#if mediaIncidents.length}
        <IncidentList incidents={mediaIncidents} />
      {:else}
        <p class="muted">{t('allClear')}</p>
      {/if}
    </section>
  </div>
{:else}
  <p class="loading">{t('loadingSnapshot')}</p>
{/if}

<style>
  .grid { display: flex; flex-direction: column; gap: 14px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 10px; }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .eyebrow { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); margin-bottom: 2px; }
  h2 { font-size: 14px; font-weight: 650; }
  .hint { font-size: 11px; color: var(--text-faint); }
  .muted { color: var(--text-muted); font-size: 12.5px; }
  .loading { color: var(--text-muted); padding: 30px 4px; }
</style>
