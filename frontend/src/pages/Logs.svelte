<script>
  import LogViewer from '../components/LogViewer.svelte';
  import { t } from '../lib/i18n.js';
</script>

<div class="grid">
  <p class="intro">{t('logsTechnical')}</p>
  <section class="panel">
    <LogViewer />
  </section>
</div>

<style>
  .grid { display: flex; flex-direction: column; gap: 14px; height: 100%; }
  .intro { color: var(--text-muted); font-size: 12.5px; }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; }
</style>
