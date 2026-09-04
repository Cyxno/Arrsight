<script>
  import { t, getLocale, setLocale } from '../lib/i18n.js';
  import { api } from '../lib/api.js';
  import { toast } from '../lib/stores.js';

  import { onMount } from 'svelte';

  export let initialConfig = null;
  export let ondone = () => {};

  const services = ['sonarr', 'radarr', 'bazarr', 'plex', 'jellyfin', 'infinidysk', 'nzbdav'];
  const steps = ['welcome', 'selectIntegrations', 'configureServices', 'configurePaths', 'testConnections', 'choosePermissions', 'reviewConfiguration', 'saveOpen'];

  let step = 0;
  let config = structuredClone(initialConfig || {});
  config.locale = config.locale || getLocale();
  config.managementMode = config.managementMode || 'monitoring';
  config.monitoring = config.monitoring || {};
  config.paths = config.paths || {};
  config.containers = Array.isArray(config.containers) ? config.containers : [];
  for (const name of services) config[name] = { enabled: false, displayName: name[0].toUpperCase() + name.slice(1), ...(config[name] || {}) };

  let apiKeyDrafts = {};
  let setupCodeValue = '';
  let adminPasswordValue = '';
  let result = '';
  let busy = false;

  const labels = { sonarr: 'Sonarr', radarr: 'Radarr', bazarr: 'Bazarr', plex: 'Plex', jellyfin: 'Jellyfin', infinidysk: 'InfiniDysk', nzbdav: 'NZBDav' };

  function serviceValue(name, field) {
    return config[name]?.[field] ?? '';
  }

  function pathRows() {
    const rows = [];
    if (config.sonarr?.enabled) rows.push(['tvRoot', '/media/tv', 'tv']);
    if (config.radarr?.enabled) rows.push(['movieRoot', '/media/movies', 'movies']);
    if (config.nzbdav?.enabled || config.monitoring?.mountsEnabled) rows.push(['nzbdavMount', '/nzbdav', 'nzbdav']);
    if (config.monitoring?.verifierLogsEnabled) rows.push(['verifierLog', '/data/verifier.log', 'data']);
    if (config.monitoring?.watchdogLogsEnabled) rows.push(['watchdogLog', '/data/watchdog.log', 'data']);
    if (config.monitoring?.periodicLogsEnabled) rows.push(['periodicLog', '/data/periodic-search.log', 'data']);
    return rows;
  }

  function validate() {
    result = '';
    let ok = true;
    for (const name of services) {
      if (!config[name]?.enabled) continue;
      const url = config[name]?.url || '';
      if (url && !/^https?:\/\/[^\s]+$/i.test(url)) { result = `${t('invalidUrl')} (${labels[name]})`; ok = false; break; }
    }
    return ok;
  }

  async function testIntegration(name, button) {
    button.disabled = true;
    result = '';
    try {
      const settings = { ...config[name] };
      if (apiKeyDrafts[name]) settings.apiKey = apiKeyDrafts[name];
      const response = await fetch('/api/test/integration', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, settings }) });
      const value = await response.json();
      result = value.code || (value.ok ? 'ok' : 'failed');
    } catch {
      result = 'network_error';
    } finally {
      button.disabled = false;
    }
  }

  async function testPath(path, category, button) {
    button.disabled = true;
    result = '';
    try {
      const response = await fetch('/api/test/path', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, category }) });
      result = response.ok ? t('pathReadable') : t('pathUnreadable');
    } catch {
      result = t('pathUnreadable');
    } finally {
      button.disabled = false;
    }
  }

  function buildPayload() {
    const payload = structuredClone(config);
    for (const name of services) {
      if (!payload[name]) continue;
      delete payload[name].secretConfigured;
      payload[name].apiKey = apiKeyDrafts[name] || '';
    }
    return payload;
  }

  async function save(setupCode, adminPassword) {
    busy = true;
    result = '';
    try {
      const payload = buildPayload();
      payload.setupCode = setupCode;
      payload.adminPassword = adminPassword;
      const value = await api.saveConfig(payload);
      if (value.ok) {
        toast(t('setupSaved'), 'ok');
        ondone();
      }
      return { ok: true };
    } catch (error) {
      result = error.code === 'validation_failed' && error.body?.errors?.length ? error.body.errors.join(', ') : error.code || error.message;
      return { ok: false };
    } finally {
      busy = false;
    }
  }

  onMount(() => { document.documentElement.lang = getLocale(); });
</script>

<div class="setup-shell">
  <form class="panel" on:submit|preventDefault={() => {}}>
    <header>
      <div class="brand"><img src="/arrsight-mark.svg" alt="" width="24" height="24" /><strong>ArrSight</strong><span class="mode">{t('setupMode')}</span></div>
      <select aria-label={t('language')} bind:value={config.locale} on:change={(event) => setLocale(event.target.value)}>
        <option value="en">English</option>
        <option value="nl">Nederlands</option>
      </select>
    </header>

    <p class="step-label">{t('step')} {step + 1} {t('of')} {steps.length}</p>
    <h1>{t(steps[step])}</h1>
    {#if step === 0}<p class="copy">{t('setupIntro')}</p>{/if}

    <div class="content">
      {#if step === 1}
        <div class="check-grid">
          {#each services as name (name)}
            <label class="check"><input type="checkbox" bind:checked={config[name].enabled} /> {config[name].displayName || labels[name]}</label>
          {/each}
        </div>
        <fieldset>
          <legend>{t('optionalFeatures')}</legend>
          <div class="check-grid">
            {#each [['dockerEnabled', 'dockerMonitoring'], ['mountsEnabled', 'mountMonitoring'], ['verifierLogsEnabled', 'verifierLogs'], ['watchdogLogsEnabled', 'watchdogLogs'], ['periodicLogsEnabled', 'periodicLogs']] as [key, labelKey] (key)}
              <label class="check"><input type="checkbox" bind:checked={config.monitoring[key]} /> {t(labelKey)}</label>
            {/each}
          </div>
        </fieldset>
      {:else if step === 2}
        {#each services.filter((name) => config[name].enabled) as name (name)}
          <fieldset data-service={name}>
            <legend>{config[name].displayName || labels[name]}</legend>
            <label><span>{t('displayName')}</span><input bind:value={config[name].displayName} /></label>
            <label><span>{t('internalUrl')}</span><input type="url" placeholder="http://sonarr:8989" bind:value={config[name].url} /></label>
            <label><span>{t('externalUrl')}</span><input type="url" bind:value={config[name].externalUrl} /></label>
            <label><span>{t('apiSecret')}</span><input type="password" autocomplete="new-password" placeholder={config[name].secretConfigured ? t('configuredSecret') : ''} bind:value={apiKeyDrafts[name]} /></label>
            <label><span>{t('containerName')}</span><input bind:value={config[name].containerName} /></label>
          </fieldset>
        {:else}
          <p class="muted">{t('noIntegrations')}</p>
        {/each}
      {:else if step === 3}
        <p class="muted">{t('volumeHelp')}</p>
        {#if pathRows().length}
          {#each pathRows() as [key, fallback, category] (key)}
            <label class="path-row">
              <span>{key}</span>
              <span class="field-with-button">
                <input bind:value={config.paths[key]} placeholder={fallback} />
                <button type="button" on:click={(event) => testPath(config.paths[key] || fallback, category, event.currentTarget)}>{t('test')}</button>
              </span>
            </label>
          {/each}
        {:else}
          <p class="muted">{t('noPaths')}</p>
        {/if}
      {:else if step === 4}
        {#each services.filter((name) => config[name].enabled) as name (name)}
          <button type="button" class="test-btn" on:click={(event) => testIntegration(name, event.currentTarget)}>{t('test')} {config[name].displayName || labels[name]}</button>
        {:else}
          <p class="muted">{t('noIntegrations')}</p>
        {/each}
      {:else if step === 5}
        <div class="modes">
          {#each [['monitoring', 'monitoringOnly'], ['containers', 'containerManagement'], ['full', 'fullManagement']] as [value, labelKey] (value)}
            <label class="check"><input type="radio" name="mode" value={value} bind:group={config.managementMode} /> {t(labelKey)}</label>
          {/each}
        </div>
        <p class="warning">{t('socketWarning')}</p>
      {:else if step === 6}
        <pre class="review">{JSON.stringify(buildPayload(), (key, value) => key === 'apiKey' ? (value ? '•••' : '') : value, 2)}</pre>
      {:else if step === 7}
        <label><span>{t('setupCode')}</span><input type="password" autocomplete="one-time-code" bind:value={setupCodeValue} required /></label>
        <label><span>{t('adminPassword')}</span><input type="password" autocomplete="new-password" minlength="10" bind:value={adminPasswordValue} required /></label>
        <small class="muted">{t('passwordHelp')}</small>
        <p class="muted hint">{t('setupIntro')}</p>
      {/if}
    </div>

    <p class="result" aria-live="polite">{result}</p>

    <footer>
      <button type="button" disabled={step === 0 || busy} on:click={() => { step = Math.max(0, step - 1); result = ''; }}>{t('back')}</button>
      {#if step < steps.length - 1}
        <button type="button" class="primary" disabled={busy} on:click={() => { if (validate()) { step += 1; result = ''; } }}>{t('continue')}</button>
      {:else}
        <button type="button" class="primary" disabled={busy} on:click={async () => { if (!validate()) return; const outcome = await save(setupCodeValue, adminPasswordValue); if (outcome.ok) { setupCodeValue = ''; adminPasswordValue = ''; } }}>{busy ? '…' : t('saveOpen')}</button>
      {/if}
    </footer>
  </form>
</div>

<style>
  .setup-shell {
    min-height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 32px 16px;
    background:
      radial-gradient(900px 480px at 80% -10%, var(--accent-soft), transparent 60%),
      var(--bg);
  }
  .panel {
    width: min(680px, 100%);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: var(--shadow);
  }
  header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .brand { display: flex; align-items: center; gap: 9px; }
  .brand strong { font-size: 15px; }
  .mode { font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 2px 9px; }
  .step-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); }
  h1 { font-size: 19px; }
  .copy { color: var(--text-muted); font-size: 13px; }
  .content { display: flex; flex-direction: column; gap: 14px; min-height: 220px; }
  fieldset { border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; margin: 0; }
  legend { font-size: 12px; font-weight: 600; color: var(--text-muted); padding: 0 6px; }
  .check-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: var(--text-muted); }
  label.check { flex-direction: row; font-weight: 500; color: var(--text); }
  input[type='text'], input[type='url'], input[type='password'], input:not([type]) { padding: 7px 10px; font-size: 13px; }
  label span { font-size: 11px; color: var(--text-faint); font-weight: 600; }
  .field-with-button { display: flex; gap: 8px; }
  .field-with-button input { flex: 1; }
  .path-row { display: grid; grid-template-columns: 130px 1fr; align-items: center; gap: 10px; }
  .test-btn { justify-self: start; font-size: 12.5px; }
  .modes { display: flex; flex-direction: column; gap: 8px; }
  .warning { font-size: 12px; color: var(--warn); background: var(--warn-soft); border-radius: var(--radius-small); padding: 9px 12px; }
  .review { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; font-family: var(--mono); font-size: 11.5px; overflow: auto; max-height: 320px; margin: 0; }
  .hint { font-size: 11.5px; }
  .result { min-height: 18px; font-size: 12.5px; color: var(--warn); word-break: break-word; }
  footer { display: flex; justify-content: space-between; gap: 10px; }
  .primary { background: var(--accent); border-color: transparent; color: #fff; font-weight: 600; }
  .primary:hover:not(:disabled) { background: var(--accent); filter: brightness(1.08); }
  .muted { color: var(--text-muted); font-size: 12.5px; }
</style>
