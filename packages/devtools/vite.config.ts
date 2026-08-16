import { defineConfig } from 'vite';
import { rozenitePlugin } from '@rozenite/vite-plugin';

// `base: './'` is THE critical fix for a blank panel: Vite's default `base: '/'` emits absolute
// `/assets/...` script paths, but Rozenite's dev-server middleware only serves plugin assets
// under `/plugins/<plugin>/**` — an absolute path 404s under that prefix.
export default defineConfig({
  base: './',
  plugins: rozenitePlugin(),
});
