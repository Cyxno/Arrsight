<script>
  import { t } from '../lib/i18n.js';
  import { login, loadSnapshot } from '../lib/stores.js';

  export let reason = null;

  let password = '';
  let busy = false;
  let error = null;

  async function submit() {
    if (busy || !password) return;
    busy = true;
    error = null;
    try {
      await login(password);
      password = '';
    } catch (err) {
      if (err.status === 429) error = t('rateLimited');
      else if (err.status === 401) error = t('invalidCredentials');
      else error = err.code === 'cross_origin' ? t('networkError') : t('networkError');
    } finally {
      busy = false;
    }
  }
</script>

<div class="login-shell">
  <form class="card" on:submit|preventDefault={submit}>
    <img src="/arrsight-mark.svg" alt="" width="34" height="34" />
    <h1>{t('loginTitle')}</h1>
    <p class="help">{reason === 'session' ? t('sessionExpired') : t('loginHelp')}</p>
    <label>
      <span>{t('adminPassword')}</span>
      <input type="password" bind:value={password} autocomplete="current-password" autofocus disabled={busy} />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button type="submit" disabled={busy || !password}>{busy ? '…' : t('login')}</button>
  </form>
</div>

<style>
  .login-shell {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(900px 480px at 75% -10%, var(--accent-soft), transparent 60%),
      var(--bg);
    padding: 20px;
  }
  .card {
    width: min(380px, 100%);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 28px 26px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: var(--shadow);
  }
  h1 { font-size: 17px; }
  .help { font-size: 12.5px; color: var(--text-muted); }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
  input { padding: 9px 12px; font-size: 14px; }
  .error { color: var(--err); font-size: 12.5px; }
  button { padding: 9px 12px; font-weight: 600; font-size: 13.5px; background: var(--accent); border-color: transparent; color: #fff; }
  button:hover:not(:disabled) { background: var(--accent); filter: brightness(1.08); }
</style>
