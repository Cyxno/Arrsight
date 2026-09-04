<script>
  export let points = [];
  export let getter = (point) => Number(point);
  export let height = 56;

  $: values = (points || []).map(getter).map(Number).filter(Number.isFinite);
  $: path = buildPath(values);

  function buildPath(values) {
    if (values.length < 2) return null;
    const low = Math.min(...values);
    const high = Math.max(...values);
    const range = high - low || 1;
    const coords = values.map((value, index) => [
      (index / (values.length - 1)) * 100,
      30 - ((value - low) / range) * 26
    ]);
    const line = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const area = `${line} 100,32 0,32`;
    return { line, area };
  }
</script>

{#if path}
  <svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none" style="height:{height}px" aria-hidden="true">
    <polygon class="area" points={path.area} />
    <polyline class="line" points={path.line} />
  </svg>
{:else}
  <div class="empty" style="height:{height}px"><span class="history-building"></span></div>
{/if}

<style>
  .spark { width: 100%; display: block; }
  .line { fill: none; stroke: var(--accent); stroke-width: 1.6; vector-effect: non-scaling-stroke; }
  .area { fill: var(--accent-soft); stroke: none; }
  .empty { display: flex; align-items: center; justify-content: center; color: var(--text-faint); font-size: 12px; }
  .history-building::before { content: '· · ·'; letter-spacing: 3px; }
</style>
