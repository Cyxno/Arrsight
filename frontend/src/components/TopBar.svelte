<script>
  import StatusBadge from './StatusBadge.svelte';
  import { t } from '../lib/i18n.js';
  import { relTime } from '../lib/format.js';
  import { theme } from '../lib/theme.js';
  import { locale, setLocale } from '../lib/i18n.js';
  import { snapshot, meta, loadSnapshot, logout } from '../lib/stores.js';
  import { TABS } from '../lib/dashboard-ui.js';
  import { route } from '../lib/route.js';

  export let menuOpen = false;
  export let toggleMenu = () => {};

  const AUTO_REFRESH_SECONDS = 60;

  $: title = t(TABS.find((tab) => tab.id === $route)?.labelKey || 'overview');
  $: status = $snapshot?.overview?.status || ($meta.error ? 'incident' : 'unknown');
</script>

<header>
  <button type="button" class="menu-toggle" aria-label={t('nav')} aria-expanded={menuOpen} on:click={toggleMenu}>
    <span></span><span></span><span></span>
  </button>
  <h1>{title}</h1>
  <div class="spacer"></div>
  <StatusBadge status={status} />
  <span class="updated" aria-live="polite">
    {#if $meta.loading}{t('refreshing')}{:else if $meta.error}{t('unavailable')}{:else if $snapshot}{t('updated')} {relTime($snapshot.generatedAt)}{/if}
  </span>
  <button type="button" class="icon-btn" title="{t('refresh')} ({t('autoRefreshMeta', { seconds: AUTO_REFRESH_SECONDS })})" disabled={$meta.loading} on:click={() => loadSnapshot(true)}>
    <span class="refresh-icon" class:spin={$meta.loading} aria-hidden="true">⟳</span>
  </button>
  <select aria-label={t('language')} bind:value={$locale} on:change={(event) => setLocale(event.target.value)}>
    <option value="en">English</option>
    <option value="nl">Nederlands</option>
  </select>
  <select aria-label={t('theme')} bind:value={$theme}>
    <option value="auto">{t('system')}</option>
    <option value="light">{t('light')}</option>
    <option value="dark">{t('dark')}</option>
  </select>
  <button type="button" class="logout" on:click={logout}>{t('logout')}</button>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 18px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 30;
    min-height: 52px;
  }
  h1 { font-size: 14.5px; font-weight: 650; }
  .spacer { flex: 1; }
  .updated { font-size: 11.5px; color: var(--text-faint); white-space: nowrap; }
  .menu-toggle { display: none; flex-direction: column; gap: 3px; padding: 8px 7px; }
  .menu-toggle span { width: 15px; height: 2px; background: var(--text); border-radius: 2px; display: block; }
  .icon-btn { padding: 5px 9px; font-size: 14px; line-height: 1; }
  .refresh-icon { display: inline-block; }
  .refresh-icon.spin { animation: spin 900ms linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .refresh-icon.spin { animation: none; } }
  .logout { font-size: 12px; color: var(--text-muted); }
  @media (max-width: 960px) {
    .menu-toggle { display: flex; }
    .updated { display: none; }
    header { padding: 10px 12px; gap: 8px; }
    select { max-width: 92px; }
  }
</style>
