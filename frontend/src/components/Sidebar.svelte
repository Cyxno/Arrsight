<script>
  import { t } from '../lib/i18n.js';
  import { TABS, calculateTabBadges } from '../lib/dashboard-ui.js';
  import { route, navigate } from '../lib/route.js';
  import { snapshot } from '../lib/stores.js';

  export let menuOpen = false;
  export let onnavigate = () => {};

  $: badges = calculateTabBadges($snapshot || {});

  function go(tab) {
    navigate(tab.hash);
    onnavigate();
  }
</script>

<aside class:open={menuOpen}>
  <a class="brand" href="#overview" aria-label={t('backToOverview')} on:click={(event) => { event.preventDefault(); go(TABS[0]); }}>
    <img src="/arrsight-mark.svg" alt="" width="26" height="26" />
    <strong>ArrSight</strong>
  </a>
  <nav aria-label={t('nav')}>
    {#each TABS as tab (tab.id)}
      <button
        type="button"
        class="nav-item"
        class:selected={$route === tab.id}
        aria-current={$route === tab.id ? 'page' : undefined}
        on:click={() => go(tab)}
      >
        <span class="icon icon-{tab.id}" aria-hidden="true"></span>
        <span class="label">{t(tab.labelKey)}</span>
        {#if badges[tab.id]?.count}
          <span class="badge {badges[tab.id].severity === 'critical' ? 'crit' : 'warn'}">{badges[tab.id].count}</span>
        {/if}
      </button>
    {/each}
  </nav>
</aside>

<style>
  aside {
    width: var(--sidebar-width);
    flex: none;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 14px 10px;
    gap: 14px;
    position: sticky;
    top: 0;
    height: 100vh;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 4px 8px;
    color: var(--text);
    text-decoration: none;
    border-radius: var(--radius-small);
  }
  .brand:hover { text-decoration: none; background: var(--surface-2); }
  .brand strong { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
  nav { display: flex; flex-direction: column; gap: 2px; }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 10px;
    background: transparent;
    border: none;
    border-radius: var(--radius-small);
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 500;
    text-align: left;
  }
  .nav-item:hover { background: var(--surface-2); color: var(--text); }
  .nav-item.selected { background: var(--accent-soft); color: var(--text); font-weight: 600; }
  .icon { width: 15px; height: 15px; flex: none; border-radius: 4px; background: var(--border-strong); opacity: 0.9; position: relative; }
  .nav-item.selected .icon { background: var(--accent); opacity: 1; }
  .icon-overview { clip-path: polygon(50% 0, 100% 100%, 0 100%); }
  .icon-downloads { clip-path: polygon(0 0, 100% 0, 50% 100%); }
  .icon-providers { clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%); }
  .icon-media { border-radius: 50%; }
  .icon-incidents { clip-path: polygon(50% 0, 100% 80%, 80% 100%, 20% 100%, 0 80%); }
  .icon-system { clip-path: polygon(20% 0, 80% 0, 100% 50%, 80% 100%, 20% 100%, 0 50%); }
  .icon-logs { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); border-radius: 3px; }
  .icon-settings { clip-path: polygon(50% 0, 65% 15%, 85% 15%, 85% 35%, 100% 50%, 85% 65%, 85% 85%, 65% 85%, 50% 100%, 35% 85%, 15% 85%, 15% 65%, 0 50%, 15% 35%, 15% 15%, 35% 15%); }
  .badge {
    margin-left: auto;
    font-size: 10.5px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--warn-soft);
    color: var(--warn);
  }
  .badge.crit { background: var(--err-soft); color: var(--err); }

  @media (max-width: 960px) {
    aside {
      position: fixed;
      z-index: 40;
      left: 0;
      top: 0;
      transform: translateX(-100%);
      transition: transform 160ms ease;
      box-shadow: var(--shadow);
      height: 100dvh;
    }
    aside.open { transform: translateX(0); }
  }
</style>
