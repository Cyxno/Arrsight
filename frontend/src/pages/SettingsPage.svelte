<script>
  import { t } from '../lib/i18n.js';
  import { api } from '../lib/api.js';
  import { config, toast, loadSnapshot, refreshConfig } from '../lib/stores.js';

  export let initialConfig = null;

  const services = ['sonarr', 'radarr', 'bazarr', 'plex', 'jellyfin', 'infinidysk', 'nzbdav'];
  const labels = { sonarr: 'Sonarr', radarr: 'Radarr', bazarr: 'Bazarr', plex: 'Plex', jellyfin: 'Jellyfin', infinidysk: 'InfiniDysk', nzbdav: 'NZBDav' };
  const pathRows = [
    ['verifierLog', '/data/verifier.log', 'data'],
    ['periodicLog', '/data/periodic-search.log', 'data'],
    ['watchdogLog', '/data/watchdog.log', 'data'],
    ['tvRoot', '/media/tv', 'tv'],
    ['movieRoot', '/media/movies', 'movies'],
    ['nzbdavMount', '/nzbdav', 'nzbdav']
  ];

  let draft = structuredClone(initialConfig || $config || {});
  draft.locale = draft.locale || 'en';
  draft.managementMode = draft.managementMode || 'monitoring';
  draft.monitoring = draft.monitoring || {};
  draft.paths = draft.paths || {};
  draft.containers = Array.isArray(draft.containers) ? [...draft.containers] : [];
  draft.links = { ...(draft.links || {}) };
  for (const name of services) draft[name] = { ...(draft[name] || {}) };

  let apiKeyDrafts = {};
  let saving = false;
  let errorMessage = '';
  let newContainer = '';
  let newLinkName = '';
  let newLinkUrl = '';

  $: source = initialConfig || $config || {};

  async function testPath(path, category, button) {
    button.disabled = true;
    errorMessage = '';
    try {
      const response = await api.testPath(path, category);
      toast(response.ok ? t('pathReadable') : t('pathUnreadable'), response.ok ? 'ok' : 'err');
    } catch {
      toast(t('pathUnreadable'), 'err');
    } finally {
      button.disabled = false;
    }
  }

  async function testIntegration(name, button) {
    button.disabled = true;
    errorMessage = '';
    try {
      const settings = { ...draft[name] };
      if (apiKeyDrafts[name]) settings.apiKey = apiKeyDrafts[name];
      const value = await api.testIntegration(name, settings);
      toast(`${labels[name]}: ${value.code || (value.ok ? 'ok' : 'failed')}`, value.ok ? 'ok' : 'err');
    } catch (error) {
      toast(`${labels[name]}: ${error.code || error.message}`, 'err');
    } finally {
      button.disabled = false;
    }
  }

  async function save() {
    saving = true;
    errorMessage = '';
    try {
      const payload = structuredClone(draft);
      for (const name of services) {
        payload[name] = { ...(payload[name] || {}) };
        payload[name].apiKey = apiKeyDrafts[name] || '';
        delete payload[name].secretConfigured;
      }
      const value = await api.saveConfig(payload);
      toast(t('saved'), 'ok');
      for (const name of services) apiKeyDrafts[name] = '';
      draft = structuredClone(value.config || draft);
      draft.containers = Array.isArray(draft.containers) ? [...draft.containers] : [];
      draft.links = { ...(draft.links || {}) };
      await refreshConfig();
      await loadSnapshot(true);
    } catch (error) {
      if (error.status === 401) {
        toast(t('authenticationRequired'), 'err');
      } else if (error.code === 'validation_failed' && error.body?.errors?.length) {
        errorMessage = `${t('validationFailed')} (${error.body.errors.join(', ')})`;
      } else {
        errorMessage = error.code || error.message;
      }
    } finally {
      saving = false;
    }
  }
</script>

<div class="grid">
  <div class="head-row">
    <p class="intro">{t('settings')}</p>
    <button type="button" class="primary" disabled={saving} on:click={save}>{saving ? t('saving') : t('save')}</button>
  </div>
  {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}

  <section class="panel">
    <div class="section-head"><p class="eyebrow">{t('general')}</p><h2>{t('managementMode')}</h2></div>
    <div class="modes">
      {#each [['monitoring', 'monitoringOnly'], ['containers', 'containerManagement'], ['full', 'fullManagement']] as [value, labelKey] (value)}
        <label class="check"><input type="radio" name="settings-mode" value={value} bind:group={draft.managementMode} /> {t(labelKey)}</label>
      {/each}
    </div>
    <p class="warning">{t('socketWarning')}</p>
  </section>

  <section class="panel">
    <div class="section-head"><p class="eyebrow">{t('selectIntegrations')}</p><h2>{t('configureServices')}</h2></div>
    {#each services as name (name)}
      <details class="service" open={draft[name]?.enabled}>
        <summary>
          <label class="check" on:click|stopPropagation={() => {}}>
            <input type="checkbox" bind:checked={draft[name].enabled} on:click|stopPropagation />
            <strong>{draft[name]?.displayName || labels[name]}</strong>
          </label>
          {#if draft[name]?.enabled}<span class="tag">{draft[name]?.secretConfigured ? t('configuredSecret').split(' — ')[0] : t('test')}</span>{/if}
        </summary>
        <div class="service-fields">
          <label><span>{t('displayName')}</span><input bind:value={draft[name].displayName} /></label>
          <label><span>{t('internalUrl')}</span><input type="url" bind:value={draft[name].url} /></label>
          <label><span>{t('externalUrl')}</span><input type="url" bind:value={draft[name].externalUrl} /></label>
          <label><span>{t('apiSecret')}</span><input type="password" autocomplete="new-password" placeholder={draft[name]?.secretConfigured ? t('configuredSecret') : ''} bind:value={apiKeyDrafts[name]} /></label>
          <label><span>{t('containerName')}</span><input bind:value={draft[name].containerName} /></label>
          <div class="row-actions">
            <button type="button" on:click={(event) => testIntegration(name, event.currentTarget)}>{t('test')}</button>
          </div>
        </div>
      </details>
    {/each}
  </section>

  <section class="panel">
    <div class="section-head"><p class="eyebrow">{t('optionalFeatures')}</p><h2>{t('monitoring')}</h2></div>
    <div class="check-grid">
      {#each [['dockerEnabled', 'dockerMonitoring'], ['mountsEnabled', 'mountMonitoring'], ['verifierLogsEnabled', 'verifierLogs'], ['watchdogLogsEnabled', 'watchdogLogs'], ['periodicLogsEnabled', 'periodicLogs']] as [key, labelKey] (key)}
        <label class="check"><input type="checkbox" bind:checked={draft.monitoring[key]} /> {t(labelKey)}</label>
      {/each}
    </div>
    <div class="numbers">
      {#each [['sampleMinutes', 'sampleInterval'], ['retentionDays', 'retention'], ['resolvedHours', 'resolvedWindow'], ['queueStaleMinutes', 'queueStale'], ['queueFailedMinutes', 'queueFailed'], ['mountWarnMs', 'mountWarn'], ['mountTimeoutMs', 'mountTimeout']] as [key, labelKey] (key)}
        <label><span>{t(labelKey)}</span><input type="number" min="0" bind:value={draft.monitoring[key]} /></label>
      {/each}
    </div>
  </section>

  <section class="panel">
    <div class="section-head"><p class="eyebrow">{t('configurePaths')}</p><h2>{t('paths')}</h2></div>
    <p class="muted">{t('volumeHelp')}</p>
    {#each pathRows as [key, fallback, category] (key)}
      <label class="path-row">
        <span>{key}</span>
        <span class="field-with-button">
          <input bind:value={draft.paths[key]} placeholder={fallback} />
          <button type="button" on:click={(event) => testPath(draft.paths[key] || fallback, category, event.currentTarget)}>{t('test')}</button>
        </span>
      </label>
    {/each}
  </section>

  <section class="panel">
    <div class="section-head"><p class="eyebrow">Docker</p><h2>{t('containersList')}</h2></div>
    <div class="chips">
      {#each draft.containers as name, index (name)}
        <span class="chip">
          {name}
          <button type="button" aria-label={t('removeLink')} on:click={() => { draft.containers = draft.containers.filter((_, index2) => index2 !== index); }}>✕</button>
        </span>
      {/each}
    </div>
    <div class="field-with-button">
      <input placeholder="plex" bind:value={newContainer} />
      <button type="button" on:click={() => { if (newContainer && !draft.containers.includes(newContainer)) { draft.containers = [...draft.containers, newContainer.trim()]; } newContainer = ''; }}>{t('addContainer')}</button>
    </div>
  </section>

  <section class="panel">
    <div class="section-head"><p class="eyebrow">{t('serviceActions')}</p><h2>{t('serviceLinks')}</h2></div>
    <div class="chips">
      {#each Object.entries(draft.links || {}) as [name, url] (name)}
        <span class="chip">{name} → {url}<button type="button" aria-label={t('removeLink')} on:click={() => { const next = { ...draft.links }; delete next[name]; draft.links = next; }}>✕</button></span>
      {/each}
    </div>
    <div class="field-with-button">
      <input placeholder={t('linkName')} bind:value={newLinkName} />
      <input placeholder="https://" bind:value={newLinkUrl} />
      <button type="button" on:click={() => { if (newLinkName && newLinkUrl) { draft.links = { ...draft.links, [newLinkName.trim()]: newLinkUrl.trim() }; } newLinkName = ''; newLinkUrl = ''; }}>{t('addLink')}</button>
    </div>
  </section>
</div>

<style>
  .grid { display: flex; flex-direction: column; gap: 14px; max-width: 860px; }
  .head-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .intro { color: var(--text-muted); font-size: 12.5px; }
  .primary { background: var(--accent); border-color: transparent; color: #fff; font-weight: 600; }
  .primary:hover:not(:disabled) { filter: brightness(1.08); }
  .error { color: var(--err); font-size: 12.5px; }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .section-head { display: flex; flex-direction: column; gap: 1px; }
  .eyebrow { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); }
  h2 { font-size: 14px; font-weight: 650; }
  .modes { display: flex; flex-direction: column; gap: 8px; }
  .check-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--text); flex-direction: row; }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; font-weight: 600; color: var(--text-faint); }
  input { padding: 7px 10px; font-size: 13px; }
  .numbers { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
  details.service { border: 1px solid var(--border); border-radius: var(--radius-small); }
  details.service summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 13px; cursor: pointer; list-style: none; }
  details.service summary::-webkit-details-marker { display: none; }
  .tag { font-size: 10.5px; color: var(--text-faint); }
  .service-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; padding: 4px 13px 13px; border-top: 1px solid var(--border); padding-top: 12px; }
  .row-actions { display: flex; align-items: flex-end; }
  .row-actions button { font-size: 12px; }
  .path-row { display: grid; grid-template-columns: 130px 1fr; align-items: center; gap: 10px; }
  .field-with-button { display: flex; gap: 8px; align-items: center; }
  .field-with-button input { flex: 1; }
  .field-with-button button { font-size: 12px; white-space: nowrap; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { display: inline-flex; align-items: center; gap: 7px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 4px 7px 4px 12px; font-size: 12px; max-width: 100%; }
  .chip button { background: none; border: none; padding: 0 4px; color: var(--text-faint); font-size: 11px; }
  .chip button:hover { color: var(--err); }
  .warning { font-size: 11.5px; color: var(--warn); }
  .muted { color: var(--text-muted); font-size: 12px; }
</style>
