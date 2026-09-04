<script>
  import { fly } from 'svelte/transition';
  import { toasts } from '../lib/stores.js';
</script>

{#if $toasts.length}
  <div class="stack" aria-live="polite">
    {#each $toasts as item (item.id)}
      <div class="toast {item.kind}" transition:fly={{ y: 10, duration: 140 }}>{item.message}</div>
    {/each}
  </div>
{/if}

<style>
  .stack {
    position: fixed;
    right: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 90;
    max-width: min(420px, 90vw);
  }
  .toast {
    background: var(--surface-3);
    border: 1px solid var(--border-strong);
    border-left: 3px solid var(--info);
    border-radius: var(--radius-small);
    padding: 9px 13px;
    font-size: 12.5px;
    box-shadow: var(--shadow);
    word-break: break-word;
  }
  .toast.ok { border-left-color: var(--ok); }
  .toast.err { border-left-color: var(--err); }
</style>
