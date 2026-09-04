<script>
  import StatusBadge from '../components/StatusBadge.svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { t } from '../lib/i18n.js';
  import { number, when, bytes } from '../lib/format.js';
  import { config, snapshot, openDrawer, exportSnapshot } from '../lib/stores.js';

  $: s = $snapshot;
  $: managementMode = $config?.managementMode || 'monitoring';
  $: managementEnabled = managementMode !== 'monitoring';
  $: fullManagement = managementMode === 'full';
  $: healthRows = ['sonarr', 'radarr'].map((key) => {
    const health = s?.health?.[key] || {};
    return {
      key,
      status: health.reachable === undefined ? 'disabled' : !health.reachable ? 'incident' : health.ok ? 'healthy' : 'degraded',
      note: health.reachable ? t('apiChecked', { status: number(health.status), time: when(health.checkedAt) }) : t('sourceUnavailable'),
      latency: `${number(health.latencyMs)} ms`
    };
  });
  $: mountChecks = Object.entries(s?.mounts?.checks || {}).map(([name, check]) => ({ name, ...check }));
  $: periods = s?.usage?.periods || {};
</script>

{#if s}
  <div class="grid">
    <p class="intro">{t('systemIntro')}</p>

    <section class="panel">
      <div class="section-head">
        <div><p class="eyebrow">Docker</p><h2>{t('containers')}</h2></div>
        <button type="button" class="link" on:click={() => openDrawer('containers', s.containers || [], t('containers'))}>{t('details')} ›</button>
      </div>
      {#if s.containers?.length}
        <div class="container-grid">
          {#each s.containers as container (container.name)}
            <button type="button" class="container-card" on:click={() => openDrawer('containers', [container], container.name)}>
              <div class="head">
                <strong>{container.name}</strong>
                <StatusBadge status={container.ok ? (container.health && container.health !== 'healthy' ? 'degraded' : 'healthy') : 'incident'} compact />
              </div>
              <small>{container.status || t('unknown')} · {t('health')}: {container.health || t('noHealthcheck')}</small>
              <small class="muted">{t('restarts')}: {number(container.restartCount)}{container.restartIncreased ? ` · ${t('restartIncreased')}` : ''} · {when(container.startedAt)}</small>
            </button>
          {/each}
        </div>
      {:else}
        <p class="muted">{t('noContainers')} {t('noContainersHelp')}</p>
      {/if}
    </section>

    <section class="panel">
      <div class="section-head"><p class="eyebrow">{t('reachability')}</p><h2>{t('apiMounts')}</h2></div>
      <div class="rows">
        {#each healthRows as row (row.key)}
          <div class="row">
            <StatusBadge status={row.status} />
            <strong>{row.key[0].toUpperCase() + row.key.slice(1)} API</strong>
            <span class="note">{row.note}</span>
            <span class="latency">{row.latency}</span>
          </div>
        {/each}
        {#each mountChecks as check (check.name)}
          <div class="row">
            <StatusBadge status={check.status || 'unknown'} />
            <strong>{check.name}</strong>
            <span class="note">{check.error || t('readPassed')} · {t('lastKnownGood')} {when(check.lastKnownGood)}</span>
            <span class="latency">{number(check.latencyMs)} ms</span>
          </div>
        {/each}
      </div>
    </section>

    <section class="panel">
      <div class="section-head"><p class="eyebrow">InfiniDysk</p><h2>{t('dataUsage')}</h2></div>
      <div class="usage">
        {#each [[t('today'), periods.daily], [t('week'), periods.weekly], [t('month'), periods.monthly], [t('year'), periods.yearly], [t('dashboardTotal'), periods.allTime]] as [label, value] (label)}
          <div class="usage-card">
            <span class="label">{label}</span>
            <strong>{bytes(value?.totalBytes)}</strong>
            <small>{t('traffic', { incoming: bytes(value?.rxBytes), outgoing: bytes(value?.txBytes) })}</small>
          </div>
        {/each}
      </div>
    </section>

    <section class="panel links-panel">
      <div class="section-head"><p class="eyebrow">{t('serviceActions')}</p><h2>{t('serviceLinks')}</h2></div>
      <p class="warning">{t('proxyWarning')}</p>
      <div class="links">
        {#each Object.entries(s.links || {}) as [name, url] (name)}
          <a href={url} target="_blank" rel="noreferrer">{name}</a>
        {:else}
          <span class="muted">{t('notConfigured')}</span>
        {/each}
      </div>
      <button type="button" class="export" on:click={exportSnapshot}>{t('exportSnapshot')}</button>
    </section>

    <section class="panel management">
      <div class="section-head">
        <div><p class="eyebrow">{t('management')}</p><h2>{t('actions')}</h2></div>
        <StatusBadge status={managementEnabled ? 'active' : 'disabled'} label={managementEnabled ? t('active') : t('monitoringOnly')} compact />
      </div>
      <div class="actions">
        {#if !managementEnabled}
          <p class="muted">{t('monitoringOnly')} — {t('actions')} {t('disabled').toLowerCase()}</p>
        {:else}
          {#if fullManagement}
            <ActionButton label={t('runVerifier')} action="run-verifier" />
            <ActionButton label={t('runPeriodic')} action="run-periodic" />
            <ActionButton label={t('runMountCheck')} action="run-watchdog" confirmText={t('confirmManagement')} />
          {/if}
          {#each s.containers || [] as container (container.name)}
            <ActionButton label={t('restart', { name: container.name })} action="restart-container" target={container.name} kind="danger" confirmText={t('confirmManagement')} />
          {/each}
        {/if}
      </div>
    </section>
  </div>
{:else}
  <p class="loading">{t('loadingSnapshot')}</p>
{/if}

<style>
  .grid { display: flex; flex-direction: column; gap: 14px; }
  .intro { color: var(--text-muted); font-size: 12.5px; }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .eyebrow { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); margin-bottom: 2px; }
  h2 { font-size: 14px; font-weight: 650; }
  .link { background: none; border: none; color: var(--accent); font-size: 12px; padding: 2px; }
  .container-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 10px; }
  .container-card { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-small); padding: 10px 12px; text-align: left; font: inherit; color: inherit; font-size: 11.5px; }
  .container-card:hover { border-color: var(--border-strong); }
  .container-card .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; }
  .container-card strong { font-size: 13px; }
  .muted { color: var(--text-muted); }
  .rows { display: flex; flex-direction: column; }
  .row { display: grid; grid-template-columns: auto 150px 1fr auto; align-items: center; gap: 12px; padding: 8px 2px; border-bottom: 1px solid var(--border); font-size: 12.5px; }
  .row:last-child { border-bottom: none; }
  .row strong { font-size: 12.5px; }
  .row .note { color: var(--text-muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .latency { font-weight: 600; font-variant-numeric: tabular-nums; }
  .usage { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .usage-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-small); padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
  .usage-card .label { font-size: 10.5px; color: var(--text-faint); font-weight: 600; }
  .usage-card strong { font-size: 16px; font-weight: 650; }
  .usage-card small { font-size: 10.5px; color: var(--text-muted); }
  .links { display: flex; flex-wrap: wrap; gap: 8px; }
  .links a { font-size: 12.5px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 5px 13px; }
  .export { align-self: flex-start; font-size: 12px; }
  .management { border-left: 3px solid var(--warn); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .warning { font-size: 11.5px; color: var(--warn); }
  .loading { color: var(--text-muted); padding: 30px 4px; }
  @media (max-width: 700px) {
    .row { grid-template-columns: auto 1fr auto; }
    .row .note { display: none; }
  }
</style>
