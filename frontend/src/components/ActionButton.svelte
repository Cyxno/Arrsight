<script>
  import { t } from '../lib/i18n.js';
  import { runAction, toast } from '../lib/stores.js';

  export let label = '';
  export let action = '';
  export let target = '';
  export let confirmText = '';
  export let kind = 'default';

  let busy = false;

  async function run() {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    busy = true;
    toast(t('actionRunning'));
    try {
      const result = await runAction(action, target || undefined);
      toast(result.message || result.error || t(result.ok ? 'started' : 'failed'), result.ok ? 'ok' : 'err');
    } catch (error) {
      toast(`${t('error')}: ${error.code || error.message}`, 'err');
    } finally {
      busy = false;
    }
  }
</script>

<button type="button" class={kind} on:click={run} disabled={busy} title={label}>
  {busy ? '…' : label}
</button>

<style>
  button { font-size: 12px; padding: 5px 11px; }
  button.danger { color: var(--err); border-color: transparent; background: var(--err-soft); }
  button.danger:hover:not(:disabled) { border-color: var(--err); }
</style>
