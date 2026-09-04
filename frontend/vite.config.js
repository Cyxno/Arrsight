import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Static icons live in the repository's public/ directory, one level above
// frontend/ (also copied to /public in the Docker build stage).
export default defineConfig({
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022'
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8090' }
  }
});
