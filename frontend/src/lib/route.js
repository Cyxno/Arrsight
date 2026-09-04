import { tabFromHash } from './dashboard-ui.js';
import { writable } from 'svelte/store';

export const route = writable(tabFromHash(typeof location === 'undefined' ? '' : location.hash).id);

export function navigate(hash) {
  if (typeof location !== 'undefined' && location.hash !== hash) location.hash = hash;
  else route.set(tabFromHash(hash).id);
}

export function syncRouteFromLocation() {
  route.set(tabFromHash(location.hash).id);
}
