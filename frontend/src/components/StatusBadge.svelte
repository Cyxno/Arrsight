<script>
  import { t } from '../lib/i18n.js';
  export let status = 'unknown';
  export let label = null;
  export let compact = false;
  const known = ['healthy', 'degraded', 'incident', 'unknown', 'active', 'disabled', 'clear'];
</script>

<span class="badge {status}" class:compact class:custom={!known.includes(status)}>
  <span class="dot" aria-hidden="true"></span>{label ?? t(known.includes(status) ? status : 'unknown')}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px 3px 8px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text-muted);
    white-space: nowrap;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-faint); flex: none; }
  .healthy { color: var(--ok); background: var(--ok-soft); border-color: transparent; }
  .healthy .dot { background: var(--ok); }
  .active { color: var(--info); background: var(--info-soft); border-color: transparent; }
  .active .dot { background: var(--info); }
  .degraded { color: var(--warn); background: var(--warn-soft); border-color: transparent; }
  .degraded .dot { background: var(--warn); }
  .incident { color: var(--err); background: var(--err-soft); border-color: transparent; }
  .incident .dot { background: var(--err); }
  .clear { color: var(--ok); background: var(--ok-soft); border-color: transparent; }
  .clear .dot { background: var(--ok); }
  .disabled { color: var(--text-faint); }
  .compact { padding: 2px 7px; font-size: 11px; }
</style>
