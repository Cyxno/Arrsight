<script>
  import StatusBadge from './StatusBadge.svelte';

  export let title = '';
  export let value = '';
  export let note = '';
  export let status = 'unknown';
  export let meta = '';
  export let onopen = null;
</script>

{#if onopen}
  <button type="button" class="status-card {status}" on:click={onopen}>
    <div class="head"><StatusBadge status={status} /><span class="title">{title}</span></div>
    <span class="value">{value}</span>
    <span class="note">{note}</span>
    {#if meta}<time>{meta}</time>{/if}
  </button>
{:else}
  <div class="status-card {status}">
    <div class="head"><StatusBadge status={status} /><span class="title">{title}</span></div>
    <span class="value">{value}</span>
    <span class="note">{note}</span>
    {#if meta}<time>{meta}</time>{/if}
  </div>
{/if}

<style>
  .status-card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 100%;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left-width: 3px;
    border-radius: var(--radius);
    padding: 13px 14px 11px;
    font: inherit;
    color: inherit;
    transition: border-color 120ms ease, transform 120ms ease;
  }
  button.status-card:hover { border-color: var(--border-strong); transform: translateY(-1px); }
  .head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .title { font-size: 12px; font-weight: 600; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .value { font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
  .note { font-size: 12px; color: var(--text-muted); }
  time { font-size: 11px; color: var(--text-faint); }
  .healthy { border-left-color: var(--ok); }
  .active { border-left-color: var(--info); }
  .degraded { border-left-color: var(--warn); }
  .incident { border-left-color: var(--err); }
  .unknown { border-left-color: var(--border-strong); }
  .disabled { border-left-color: var(--border); opacity: 0.75; }
</style>
