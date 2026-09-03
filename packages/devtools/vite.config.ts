import { defineConfig } from 'vite';
import { rozenitePlugin } from '@rozenite/vite-plugin';

// `base: './'` is THE critical fix for a blank panel: Vite's default `base: '/'` emits absolute
// `/assets/...` script paths, but Rozenite's dev-server middleware only serves plugin assets
// under `/plugins/<plugin>/**` — an absolute path 404s under that prefix.
//
// `tailwind: false`: `rozenitePlugin()`'s default browser-target build calls `@tailwindcss/vite`'s
// export as a function; that package ships ESM-only (`exports: {".": {default: "./dist/index.mjs"}}`,
// no CJS entry), so Node's native require()-of-ESM interop hands `@rozenite/vite-plugin`'s bundled
// CJS a `{default: fn}` namespace instead of `fn` — `TypeError: tailwindcss is not a function`,
// reproduced 2026-08-18 on the installed `@tailwindcss/vite@4.2.2` + `@rozenite/vite-plugin@2.1.0`
// pair. This panel has never used a Tailwind utility class (plain inline `style={{...}}`
// throughout tree-inspector-panel.tsx) — disabling the plugin's Tailwind pass skips exactly the
// broken, unused step. Revisit if the panel ever adopts Tailwind classes; check whether the
// version pair above still has this interop bug first.
export default defineConfig({
  base: './',
  plugins: rozenitePlugin({ tailwind: false }),
});
