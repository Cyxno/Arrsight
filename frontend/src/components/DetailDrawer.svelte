<script>
  import { fade, fly } from 'svelte/transition';
  import { t } from '../lib/i18n.js';
  import { number, when } from '../lib/format.js';
  import { incidentTab } from '../lib/dashboard-ui.js';
  import { drawer, closeDrawer, snapshot } from '../lib/stores.js';
  import IncidentList from './IncidentList.svelte';
  import StatusBadge from './StatusBadge.svelte';

  let asideEl = null;
  let closeEl = null;

  $: if ($drawer && closeEl) setTimeout(() => closeEl?.focus(), 30);

  function onWindowKeydown(event) {
    if (!$drawer) return;
    if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); return; }
    if (event.key === 'Tab' && asideEl) {
      const focusable = asideEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  function queueRows(source) {
    const queue = $snapshot?.queues?.[source];
    return queue?.records || queue?.rows || [];
  }

  function statusClass(state) { return state === 'incident' ? 'err' : state === 'degraded' ? 'warn' : 'ok'; }
</script>

<svelte:window on:keydown={onWindowKeydown} />

{#if $drawer}
  <div class="overlay" transition:fade={{ duration: 120 }} on:click={closeDrawer} aria-hidden="true"></div>
  <aside
    bind:this={asideEl}
    role="dialog"
    aria-modal="true"
    aria-label={$drawer.title || t('details')}
    transition:fly={{ x: 480, duration: 170, opacity: 1 }}
  >
    <header>
      <div>
        <p class="eyebrow">{t('details')}</p>
        <h2>{$drawer.title || t('statusDetails')}</h2>
      </div>
      <button type="button" bind:this={closeEl} class="close" on:click={closeDrawer} aria-label={t('close')}>✕</button>
    </header>

    <div class="body">
      {#if $drawer.kind === 'node'}
        {@const node = $drawer.data}
        <div class="kv"><span>{t('state')}</span><StatusBadge status={node.status || 'unknown'} /></div>
        {#if node.latencyMs !== null && node.latencyMs !== undefined}
          <div class="kv"><span>{t('latency')}</span><strong>{number(node.latencyMs)} ms</strong></div>
        {/if}
        {#if node.problem}<div class="kv"><span>{t('error')}</span><strong class="err-text">{node.problem}</strong></div>{/if}
        <div class="kv"><span>{t('lastKnownGood')}</span><strong>{node.lastSuccess ? when(node.lastSuccess) : t('unknown')}</strong></div>

      {:else if $drawer.kind === 'queues'}
        {@const source = $drawer.data?.source}
        {#each ['sonarr', 'radarr', 'nzbdav'].filter((key) => !source || key === source) as key (key)}
          <h3>{key === 'nzbdav' ? t('logNzbdav') : key[0].toUpperCase() + key.slice(1)}</h3>
          {@const rows = queueRows(key)}
          {#if rows.length}
            <table>
              <thead><tr><th>{t('itemTitle')}</th><th>{t('state')}</th><th>{t('progress')}</th><th>{t('age')}</th><th>{t('eta')}</th></tr></thead>
              <tbody>
                {#each rows as row (row.id)}
                  <tr>
                    <td class="wrap">{row.title || '–'}</td>
                    <td><span class="pill {statusClass(row.state)}">{row.state}</span></td>
                    <td>{row.progress === null || row.progress === undefined ? '–' : `${Math.round(row.progress)}%`}</td>
                    <td>{row.ageMinutes === null || row.ageMinutes === undefined ? '–' : `${number(row.ageMinutes)} min`}</td>
                    <td>{row.eta || '–'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <p class="muted">{t('queueEmpty')}</p>
          {/if}
        {/each}

      {:else if $drawer.kind === 'mount'}
        {#each Object.entries($drawer.data?.checks || {}) as [name, check] (name)}
          <h3>{name}</h3>
          <div class="kv"><span>{t('state')}</span><StatusBadge status={check.status || 'unknown'} /></div>
          <div class="kv"><span>{t('latency')}</span><strong>{number(check.latencyMs)} ms</strong></div>
          <div class="kv"><span>{t('error')}</span><strong class={check.error ? 'err-text' : ''}>{check.error || t('readPassed')}</strong></div>
          <div class="kv"><span>{t('lastKnownGood')}</span><strong>{when(check.lastKnownGood)}</strong></div>
          <div class="kv"><span>{t('lastFailure')}</span><strong>{when(check.lastFailure)}</strong></div>
          <div class="kv"><span>{t('consecutiveFailures', { count: number(check.consecutiveFailures || 0) })}</span><strong>{number(check.consecutiveFailures || 0)}</strong></div>
        {/each}

      {:else if $drawer.kind === 'providers'}
        {@const name = $drawer.data?.name}
        {#each ($snapshot?.providers || []).filter((provider) => !name || provider.name === name) as provider (provider.name)}
          <h3>{provider.name}</h3>
          <div class="kv"><span>{t('state')}</span><StatusBadge status={provider.status || 'unknown'} /></div>
          <div class="kv"><span>{t('trips')}</span><strong>{number(provider.trips)}</strong></div>
          <div class="kv"><span>{t('missingArticles')}</span><strong>{number(provider.missingArticles)}</strong></div>
          <div class="kv"><span>{t('lastTrip')}</span><strong>{provider.lastTrip ? when(provider.lastTrip) : '–'}</strong></div>
          <div class="kv"><span>{t('lastRecovery')}</span><strong>{provider.lastRecovery ? when(provider.lastRecovery) : '–'}</strong></div>
        {/each}
        <h3>{t('providerIncidents')}</h3>
        <IncidentList incidents={($snapshot?.incidents?.active || []).filter((incident) => incidentTab(incident) === 'providers')} />

      {:else if $drawer.kind === 'containers'}
        <table>
          <thead><tr><th>{t('linkName')}</th><th>{t('state')}</th><th>{t('health')}</th><th>{t('restarts')}</th></tr></thead>
          <tbody>
            {#each $drawer.data || [] as container (container.name)}
              <tr>
                <td>{container.name}</td>
                <td><span class="pill {container.ok ? 'ok' : 'err'}">{container.ok ? t('active') : t('incident')}</span></td>
                <td>{container.health || t('noHealthcheck')}</td>
                <td>{number(container.restartCount)}{container.restartIncreased ? ' ⚠' : ''}</td>
              </tr>
            {/each}
          </tbody>
        </table>

      {:else if $drawer.kind === 'incidents'}
        <IncidentList incidents={$drawer.data?.active || []} />
        <h3>{t('resolved')}</h3>
        <IncidentList incidents={$drawer.data?.resolved || []} />

      {:else if $drawer.kind === 'repairs'}
        {@const summary = $drawer.data?.repairs?.summary || {}}
        <div class="kv"><span>{t('verifierRuns')}</span><strong>{number(summary.runs)}</strong></div>
        <div class="kv"><span>{t('repairs')}</span><strong>{number(summary.repairs)}</strong></div>
        <div class="kv"><span>{t('clean')}</span><strong>{number(summary.clean)}</strong></div>
        <div class="kv"><span>{t('succeeded')}</span><strong>{number(summary.succeeded)}</strong></div>
        <div class="kv"><span>{t('incomplete')}</span><strong>{number(summary.incomplete)}</strong></div>
        <div class="kv"><span>{t('failed')}</span><strong>{number(summary.failed)}</strong></div>
        {#each ($drawer.data?.repairs?.runs || []).slice(-6).reverse() as run, index (index)}
          <h3>{when(run.started)}</h3>
          <div class="kv"><span>{t('repairsPerformed', { count: number(run.repairs) })}</span><strong>{number(run.repairs)}</strong></div>
          <div class="kv"><span>{t('streamChecks', { count: number(run.streamChecks) })}</span><strong>{number(run.streamChecks)}</strong></div>
        {/each}

      {:else if $drawer.kind === 'problems'}
        {#each ($drawer.data?.nzbdav?.uniqueProblems || []).slice(0, 25) as problem, index (index)}
          <div class="problem">
            <span class="pill warn">{problem.type}</span>
            <div class="copy"><strong>{problem.title}</strong><small>{number(problem.count)}×</small></div>
          </div>
        {/each}
        {#each ($drawer.data?.bazarr?.uniqueProblems || []).slice(0, 15) as problem, index (index)}
          <div class="problem">
            <span class="pill info">bazarr</span>
            <div class="copy"><strong>{problem.title}</strong><small>{number(problem.count)}×</small></div>
          </div>
        {/each}
        {#if !($drawer.data?.nzbdav?.uniqueProblems || []).length && !($drawer.data?.bazarr?.uniqueProblems || []).length}
          <p class="muted">{t('noData')}</p>
        {/if}

      {:else if $drawer.kind === 'service'}
        {@const kind = $drawer.data?.kind}
        {@const snap = $drawer.data?.snapshot || {}}
        {#if kind === 'sonarr' || kind === 'radarr'}
          {@const health = snap.health?.[kind] || {}}
          {@const queue = snap.queues?.[kind] || {}}
          {@const wantedCounts = snap.wanted?.[kind] || {}}
          <div class="kv"><span>API</span><StatusBadge status={health.reachable ? (health.ok ? 'healthy' : 'degraded') : 'incident'} /></div>
          <div class="kv"><span>{t('latency')}</span><strong>{number(health.latencyMs)} ms</strong></div>
          <div class="kv"><span>{t('apiChecked', { status: number(health.status), time: when(health.checkedAt) })}</span><strong></strong></div>
          <div class="kv"><span>{t('queues')}</span><strong>{number(queue.total)} ({number(queue.failed)} {t('failed')}, {number(queue.stalled)} {t('degraded')})</strong></div>
          <div class="kv"><span>{t('backlog')}</span><strong>{t('wanted')} — missing {number(wantedCounts.missing)} · cutoff {number(wantedCounts.cutoff)}</strong></div>
        {:else if kind === 'infinidysk'}
          {@const queue = snap.queues?.nzbdav || {}}
          {@const usage = snap.usage || {}}
          <div class="kv"><span>{t('queues')}</span><strong>{number(queue.total)} items · {number(queue.failed)} {t('failed')}</strong></div>
          <div class="kv"><span>{t('today')}</span><strong>{Math.round((usage?.periods?.daily?.totalBytes || 0) / 1073741824)} GB</strong></div>
          <div class="kv"><span>{t('lastKnownGood')}</span><strong>{usage.lastSampleAt ? when(usage.lastSampleAt) : t('unknown')}</strong></div>
        {:else if kind === 'mount'}
          <IncidentList incidents={[]} />
          {#each Object.entries(snap.mounts?.checks || {}) as [name, check] (name)}
            <div class="kv"><span>{name}</span><StatusBadge status={check.status} /></div>
          {/each}
        {:else if kind === 'docker'}
          <div class="kv"><span>{t('containers')}</span><strong>{number((snap.containers || []).filter((container) => container.ok).length)} / {number((snap.containers || []).length)}</strong></div>
        {/if}

      {:else}
        <p class="muted">{t('noData')}</p>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(4, 6, 10, 0.55);
    z-index: 60;
  }
  aside {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(520px, 96vw);
    background: var(--surface);
    border-left: 1px solid var(--border);
    z-index: 61;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow);
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 16px 18px 12px;
    border-bottom: 1px solid var(--border);
  }
  .eyebrow { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); }
  header h2 { font-size: 15px; margin-top: 2px; }
  .close { padding: 5px 10px; font-size: 13px; }
  .body { padding: 14px 18px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
  h3 { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 10px; }
  .kv { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; padding: 5px 0; border-bottom: 1px dashed var(--border); font-size: 12.5px; }
  .kv > span { color: var(--text-muted); }
  .err-text { color: var(--err); }
  .muted { color: var(--text-muted); font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; color: var(--text-faint); font-weight: 600; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 8px 4px 0; border-bottom: 1px solid var(--border); }
  td { padding: 6px 8px 6px 0; border-bottom: 1px solid var(--border); vertical-align: top; }
  td.wrap { word-break: break-word; min-width: 140px; }
  .pill { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--surface-3); color: var(--text-muted); white-space: nowrap; }
  .pill.ok { background: var(--ok-soft); color: var(--ok); }
  .pill.warn { background: var(--warn-soft); color: var(--warn); }
  .pill.err { background: var(--err-soft); color: var(--err); }
  .pill.info { background: var(--info-soft); color: var(--info); }
  .problem { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; border-bottom: 1px dashed var(--border); }
  .problem .copy { display: flex; gap: 8px; align-items: baseline; }
  .problem small { color: var(--text-faint); }
</style>
