<script>
  import StatusBadge from './StatusBadge.svelte';
  import { t, tf } from '../lib/i18n.js';
  import { number, when } from '../lib/format.js';
  import { openDrawer } from '../lib/stores.js';

  export let chain = [];

  function connectorClass(a, b) {
    const weight = { incident: 3, degraded: 2, unknown: 1, disabled: 0, healthy: 0, active: 0 };
    const worst = (weight[a] || 0) >= (weight[b] || 0) ? a : b;
    return worst;
  }

  const queueSnapshotRows = (node) => {
    if (node.latencyMs !== null && node.latencyMs !== undefined) return `${number(node.latencyMs)} ms`;
    if (node.problem) return node.problem;
    if (node.lastSuccess) return `OK · ${when(node.lastSuccess)}`;
    return t('unknown');
  };
</script>

{#if chain.length}
  <div class="pipeline" role="list">
    {#each chain as node, index (node.id)}
      <button type="button" role="listitem" class="node {node.status || 'unknown'}" on:click={() => openDrawer('node', node, tf(`chain.${node.id}`, node.label))}>
        <span class="dot" aria-hidden="true"></span>
        <span class="copy">
          <strong>{tf(`chain.${node.id}`, node.label)}</strong>
          <small>{queueSnapshotRows(node)}</small>
        </span>
        <StatusBadge status={node.status || 'unknown'} compact />
      </button>
      {#if index < chain.length - 1}
        <span class="connector {connectorClass(node.status, chain[index + 1].status)}" aria-hidden="true">
          <span class="flow"></span>
        </span>
      {/if}
    {/each}
  </div>
{:else}
  <p class="empty muted">{t('noData')}</p>
{/if}

<style>
  .pipeline {
    display: flex;
    align-items: stretch;
    gap: 0;
    overflow-x: auto;
    padding: 4px 2px 8px;
  }
  .node {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 148px;
    max-width: 236px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 9px 11px;
    text-align: left;
    flex: none;
    font: inherit;
    color: inherit;
    transition: border-color 120ms ease, transform 120ms ease;
  }
  .node:hover { border-color: var(--border-strong); transform: translateY(-1px); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--text-faint); flex: none; }
  .node.healthy .dot { background: var(--ok); box-shadow: 0 0 8px var(--ok-soft); }
  .node.active .dot { background: var(--info); }
  .node.degraded .dot { background: var(--warn); box-shadow: 0 0 8px var(--warn-soft); }
  .node.incident .dot { background: var(--err); box-shadow: 0 0 10px var(--err-soft); }
  .copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .copy strong { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .copy small { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .connector {
    flex: none;
    width: 26px;
    height: 2px;
    align-self: center;
    background: var(--border-strong);
    position: relative;
    border-radius: 2px;
  }
  .connector.degraded { background: var(--warn); }
  .connector.incident { background: var(--err); }
  .flow {
    position: absolute;
    top: -2px;
    left: 0;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok);
    opacity: 0;
  }
  .connector.healthy .flow, .connector.active .flow {
    background: var(--accent);
    animation: flow 2.4s linear infinite;
  }
  .connector.healthy .flow { background: var(--ok); }
  @keyframes flow {
    0% { left: -3px; opacity: 0; }
    15% { opacity: 0.9; }
    85% { opacity: 0.9; }
    100% { left: 23px; opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .flow { animation: none; opacity: 0; }
  }
  .empty { color: var(--text-muted); }
</style>
