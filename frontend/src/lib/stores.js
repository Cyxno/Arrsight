import { writable, get } from 'svelte/store';
import { api, ApiError } from './api.js';

export const auth = writable({ required: false, authenticated: false, checked: false });
export const configured = writable(true);
export const config = writable(null);
export const snapshot = writable(null);
export const meta = writable({ loading: false, error: null, updatedAt: null });
export const drawer = writable(null);
export const toasts = writable([]);

let autoTimer = null;
let authRedirectPending = false;

export function openDrawer(kind, data, title = null) {
  drawer.set({ kind, data, title, openedAt: Date.now() });
}

export function closeDrawer() {
  drawer.set(null);
}

export function toast(message, kind = 'info') {
  const id = Date.now() + Math.random();
  toasts.update((list) => [...list, { id, message, kind }]);
  setTimeout(() => toasts.update((list) => list.filter((item) => item.id !== id)), 5000);
}

export async function boot() {
  let status = { required: false, authenticated: false };
  try { status = await api.authStatus(); } catch { /* server unreachable; still render shell */ }
  auth.set({ ...status, checked: true });
  let conf = { configured: true };
  try { conf = await api.config(); config.set(conf.config ?? null); } catch (error) {
    if (error?.status !== 401) console.warn('config load failed', error);
  }
  configured.set(conf.configured !== false);
  if (!(status.required && !status.authenticated)) await loadSnapshot(false);
}

export async function loadSnapshot(force = false) {
  if (get(auth).required && !get(auth).authenticated) return;
  meta.update((value) => ({ ...value, loading: true }));
  try {
    const data = await api.snapshot(force);
    snapshot.set(data);
    meta.update((value) => ({ ...value, loading: false, error: null, updatedAt: data.generatedAt }));
  } catch (error) {
    meta.update((value) => ({ ...value, loading: false, error }));
    if (error instanceof ApiError && error.status === 401) {
      auth.update((value) => ({ ...value, required: true, authenticated: false }));
      authRedirectPending = true;
    }
  }
}

export function startAutoRefresh(seconds = 60) {
  if (autoTimer) return;
  autoTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!get(configured)) return;
    const state = get(auth);
    if (state.required && !state.authenticated) return;
    loadSnapshot(false);
  }, seconds * 1000);
}

export async function refreshConfig() {
  try {
    const conf = await api.config();
    config.set(conf.config ?? null);
    configured.set(conf.configured !== false);
  } catch { /* keep current */ }
}

export async function login(password) {
  await api.login(password);
  auth.update((value) => ({ ...value, authenticated: true }));
  try { const conf = await api.config(); config.set(conf.config ?? null); configured.set(conf.configured !== false); } catch { /* keep defaults */ }
  await loadSnapshot(true);
}

export async function logout() {
  try { await api.logout(); } catch { /* session already gone */ }
  auth.update((value) => ({ ...value, authenticated: false }));
  snapshot.set(null);
}

export async function runAction(action, target) {
  const result = await api.action(action, target);
  return result;
}

export function exportSnapshot() {
  const data = get(snapshot);
  if (!data || typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  link.download = `arrsight-snapshot-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
