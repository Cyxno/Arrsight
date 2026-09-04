<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import Sidebar from './components/Sidebar.svelte';
  import TopBar from './components/TopBar.svelte';
  import DetailDrawer from './components/DetailDrawer.svelte';
  import Toasts from './components/Toasts.svelte';
  import LoginView from './components/LoginView.svelte';
  import SetupWizard from './components/SetupWizard.svelte';
  import Overview from './pages/Overview.svelte';
  import Downloads from './pages/Downloads.svelte';
  import Providers from './pages/Providers.svelte';
  import Media from './pages/Media.svelte';
  import Incidents from './pages/Incidents.svelte';
  import System from './pages/System.svelte';
  import Logs from './pages/Logs.svelte';
  import SettingsPage from './pages/SettingsPage.svelte';
  import { syncRouteFromLocation, route } from './lib/route.js';
  import { auth, configured, config, snapshot, boot, startAutoRefresh } from './lib/stores.js';
  import { t, locale, getLocale } from './lib/i18n.js';

  let ready = false;
  let menuOpen = false;

  onMount(() => {
    document.documentElement.lang = getLocale();
    syncRouteFromLocation();
    const onHash = () => {
      syncRouteFromLocation();
      menuOpen = false;
    };
    window.addEventListener('hashchange', onHash);
    (async () => {
      await boot();
      ready = true;
      startAutoRefresh(60);
    })();
    return () => window.removeEventListener('hashchange', onHash);
  });
</script>

{#if !ready}
  <div class="boot" in:fade>
    <img src="/arrsight-mark.svg" alt="" width="30" height="30" />
    <p>{t('loading')}…</p>
  </div>
{:else if $configured === false}
  <SetupWizard initialConfig={$config} ondone={boot} />
{:else if $auth.checked && $auth.required && !$auth.authenticated}
  <LoginView />
{:else}
  {#key $locale}
    <div class="shell">
      <Sidebar {menuOpen} onnavigate={() => (menuOpen = false)} />
      <div class="main">
        <TopBar {menuOpen} toggleMenu={() => (menuOpen = !menuOpen)} />
        <main class="content">
          {#key $route}
            <div class="page-wrap" in:fade={{ duration: 110 }}>
              {#if $route === 'overview'}
                <Overview />
              {:else if $route === 'downloads'}
                <Downloads />
              {:else if $route === 'providers'}
                <Providers />
              {:else if $route === 'media'}
                <Media />
              {:else if $route === 'incidents'}
                <Incidents />
              {:else if $route === 'system'}
                <System />
              {:else if $route === 'logs'}
                <Logs />
              {:else if $route === 'settings'}
                <SettingsPage />
              {/if}
            </div>
          {/key}
        </main>
      </div>
    </div>
    <DetailDrawer />
  {/key}
{/if}
<Toasts />

<style>
  .boot {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-muted);
  }
  .shell { display: flex; min-height: 100vh; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .content { flex: 1; padding: 16px 18px 40px; }
  .page-wrap { max-width: 1280px; margin: 0 auto; }
  @media (max-width: 960px) {
    .content { padding: 12px 12px 32px; }
  }
</style>
