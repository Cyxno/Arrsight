<script>
  import Sparkline from './Sparkline.svelte';
  import { number } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  export let title = '';
  export let points = [];
  export let getter = (point) => 0;
  export let format = (value) => number(value);
  export let trend = null;
</script>

<div class="trend-card">
  <div class="head">
    <span class="title">{title}</span>
    {#if trend && trend.direction && trend.direction !== 'unknown'}
      <span class="delta {trend.direction}" title={String(trend.delta ?? '')}>
        {trend.direction === 'better' ? '↘' : trend.direction === 'worse' ? '↗' : '→'}
        {format(Math.abs(trend.delta ?? 0))}
      </span>
    {/if}
  </div>
  <div class="value">{format(getter(points.at(-1) || {}))}</div>
  <Sparkline {points} {getter} height={48} />
  <p class="meta">{t('historyPeriod', { count: number(points.length) })}</p>
</div>

<style>
  .trend-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .title { font-size: 12px; font-weight: 600; color: var(--text-muted); }
  .delta { font-size: 11px; font-weight: 600; }
  .delta.better { color: var(--ok); }
  .delta.worse { color: var(--err); }
  .delta.stable { color: var(--text-faint); }
  .value { font-size: 19px; font-weight: 650; letter-spacing: -0.01em; }
  .meta { font-size: 11px; color: var(--text-faint); margin-top: 6px; }
</style>
