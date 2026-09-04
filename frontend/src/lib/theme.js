import { writable } from 'svelte/store';

const KEY = 'arr-theme';

function initial() {
  if (typeof localStorage === 'undefined') return 'auto';
  return localStorage.getItem(KEY) || 'auto';
}

export const theme = writable(initial());

let applied = initial();
theme.subscribe((value) => {
  applied = value === 'light' || value === 'dark' ? value : 'auto';
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, applied);
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = applied;
});

export function getTheme() { return applied; }
