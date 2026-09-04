<script>
  import StatusBadge from './StatusBadge.svelte';
  import { t } from '../lib/i18n.js';
  import { number, relTime } from '../lib/format.js';

  export let overview = { status: 'unknown', activeProblems: 0 };
  export let updatedAt = null;
</script>

<section class="overall {overview.status}" aria-live="polite">
  <span class="pulse" aria-hidden="true"><span class="core"></span></span>
  <div class="copy">
    <div class="row">
      <h2>{t('generalStatus')}</h2>
      <StatusBadge status={overview.status} />
    </div>
    <p class="line">
      {overview.activeProblems
        ? t('activeSignals', { count: number(overview.activeProblems) })
        : t('allClear')}
    </p>
    <p class="measured">{t('lastMeasurement')}: {relTime(updatedAt)}</p>
  </div>
</section>

<style>
  .overall {
    display: flex;
    align-items: center;
    gap: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 18px;
    position: relative;
    overflow: hidden;
  }
  .overall::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--text-faint);
  }
  .overall.healthy::before { background: var(--ok); }
  .overall.degraded::before { background: var(--warn); }
  .overall.incident::before { background: var(--err); }
  .pulse {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .core { width: 14px; height: 14px; border-radius: 50%; background: var(--text-faint); }
  .healthy .core { background: var(--ok); animation: breathe 3s ease-in-out infinite; }
  .degraded .core { background: var(--warn); }
  .incident .core { background: var(--err); animation: breathe 1.6s ease-in-out infinite; }
  @keyframes breathe {
    0%, 100% { box-shadow: 0 0 0 0 var(--ok-soft); }
    50% { box-shadow: 0 0 0 7px var(--ok-soft); }
  }
  .incident .core { animation-name: breathe-err; }
  @keyframes breathe-err {
    0%, 100% { box-shadow: 0 0 0 0 var(--err-soft); }
    50% { box-shadow: 0 0 0 7px var(--err-soft); }
  }
  @media (prefers-reduced-motion: reduce) {
    .core { animation: none !important; }
  }
  .copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .row { display: flex; align-items: center; gap: 10px; }
  .row h2 { font-size: 14px; font-weight: 650; }
  .line { font-size: 13px; color: var(--text); }
  .measured { font-size: 11.5px; color: var(--text-faint); }
</style>
